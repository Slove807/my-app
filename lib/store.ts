import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ARCHIVE_DIR,
  CB_CERTIFICATE_FILENAME_PATTERN,
  CHAT_CONTEXT_CHARS,
  DEFAULT_ROOT_DIR,
  DEFERRED_EXTENSIONS,
  MAX_FILE_BYTES,
  MAX_SCAN_DEPTH,
  MAX_SCAN_FILES,
  MAX_WINDOWS_PATH,
  SCAN_BATCH_SIZE,
  SCAN_CACHE_FILE,
  SUPPORTED_EXTENSIONS,
  isExcludedFolder,
  isExcludedFromScan,
} from "./config";
import {
  categorize,
  categoryFolderPaths,
  testLabelForStandard,
  type DocCategory,
} from "./categories";
import { applyManualMeta, findManualMeta } from "./manual-meta";
import { findLatestStandard } from "./standard-lookup";
import { compareTexts } from "./compare";
import { ExtractError, extractText, isKnownExtension } from "./extract";
import {
  extractCertifiedReportNo,
  extractRevisionInfo,
  isCbCertificate,
  isSameRevision,
  makeAliases,
  makeDocKey,
} from "./metadata";
import { summarizeChange } from "./summarize";
import { latestVersion, orderVersions } from "./versions";
import type {
  CategoryReport,
  CategoryScanSummary,
  DocRecord,
  DocVersion,
  ProcessResult,
  RevisionInfo,
  ScanSummary,
} from "./types";

export async function ensureDirs(): Promise<void> {
  for (const dir of [ARCHIVE_DIR, DEFAULT_ROOT_DIR]) {
    await mkdir(dir, { recursive: true });
  }
}

/** 보관 중인 모든 문서를 최근 등록순으로 돌려준다 */
export async function listDocuments(): Promise<DocRecord[]> {
  await ensureDirs();
  const entries = await readdir(ARCHIVE_DIR, { withFileTypes: true });
  const records: DocRecord[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const record = await readRecord(entry.name);
    if (record) records.push(record);
  }

  return records.sort((a, b) => {
    const aTime = a.versions.at(-1)?.uploadedAt ?? "";
    const bTime = b.versions.at(-1)?.uploadedAt ?? "";
    return bTime.localeCompare(aTime);
  });
}

export async function getDocument(docKey: string): Promise<DocRecord | null> {
  return readRecord(docKey);
}

/** 문서 하나를 처리한다 (추출 → 개정정보 확인 → 비교 → 요약 → 보관) */
export async function processIncoming(params: {
  buffer: Buffer;
  originalName: string;
  containsPersonalInfo: boolean;
  sourcePath?: string | null;
  /** ★기본정보 제품군 (예: POTENZA) */
  productFamily?: string | null;
  /** ★기본정보 시험항목 (카테고리 스캔에서만 채워짐) */
  categoryLabel?: string | null;
}): Promise<ProcessResult> {
  const { buffer, originalName, containsPersonalInfo } = params;
  const sourcePath = params.sourcePath ?? null;
  const productFamily = params.productFamily ?? null;
  const categoryLabel = params.categoryLabel ?? null;
  const warnings: string[] = [];
  await ensureDirs();

  if (!isKnownExtension(originalName)) {
    return {
      status: "error",
      message: `지원하지 않는 파일 형식입니다: ${originalName}`,
      warnings,
    };
  }

  let text: string;
  let usedOcr: boolean;
  try {
    ({ text, usedOcr } = await extractText(buffer, originalName));
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof ExtractError
          ? `${originalName}: ${error.message}`
          : `${originalName}: 본문을 읽지 못했습니다 (${String(error)})`,
      warnings,
    };
  }

  // CB Test Certificate는 시험성적서와 별도 문서로 다루지 않고, 근거가 된 성적서 번호를 찾아
  // 그 성적서의 해당 버전에 첨부만 한다 (요청 8번). 대응하는 성적서를 못 찾으면 아래로 계속 진행해
  // 기존처럼 독립 문서로 보관한다.
  if (isCbCertificate(text)) {
    const attached = await tryAttachCertificate({
      reportNo: extractCertifiedReportNo(text),
      buffer,
      originalName,
      sourcePath,
    });
    if (attached) return attached;
  }

  if (containsPersonalInfo) {
    // PRD 7번 결정: 개인정보가 있어도 경고만 남기고 진행한다
    warnings.push(
      "개인정보가 포함된 문서로 표시되었습니다. 요약 결과를 외부에 공유하지 않도록 주의하세요.",
    );
  }

  const extracted = extractRevisionInfo(text, originalName);
  const docKey = makeDocKey(text, originalName);

  // 스캔(이미지)으로만 된 PDF는 본문에 글자가 없어 아무것도 뽑을 수 없다.
  // 담당자가 data/manual-meta.json에 적어 둔 값이 있으면 그것으로 채운다.
  const manual = await findManualMeta(originalName);
  const info = manual ? applyManualMeta(extracted, manual) : extracted;
  const title = info.title ?? docKey;

  // 적용 규격으로 무슨 시험인지 판단되면(IEC 60601-1-2 → EMC test 등) 폴더에서 정한
  // 카테고리 이름보다 그 값을 먼저 쓴다
  const resolvedCategoryLabel =
    testLabelForStandard(info.appliedStandard) ?? manual?.categoryLabel ?? categoryLabel;

  // 적용 규격에 더 새로운 판이 나왔는지 확인한다 (결과는 파일에 적어 두고 재사용한다)
  const latestStandard = info.appliedStandard
    ? await findLatestStandard(info.appliedStandard)
    : null;

  if (!info.revisionNo && !info.revisionDate) {
    warnings.push(
      "문서에서 개정번호와 개정일자를 찾지 못해 본문 내용으로만 변경 여부를 확인했습니다.",
    );
  }

  const record = (await readRecord(docKey)) ?? {
    key: docKey,
    title,
    aliases: [],
    versions: [],
  };
  record.aliases = mergeAliases(record.aliases, makeAliases(originalName, info.model));
  const latest = record.versions.at(-1);

  // 첫 번째 버전은 비교 대상이 없다
  if (!latest) {
    const version = await writeVersion({
      docKey,
      versionNo: 1,
      buffer,
      text,
      originalName,
      sourcePath,
      info,
      containsPersonalInfo,
      changeSummary: null,
      productFamily,
      categoryLabel: resolvedCategoryLabel,
      manualEntry: Boolean(manual),
      ocrUsed: usedOcr,
      latestStandard,
    });
    record.title = title;
    record.versions.push(version);
    await saveRecord(record);

    return {
      status: "created",
      message: `'${title}' 문서를 처음으로 보관했습니다. 다음 개정본이 들어오면 변경 내용을 비교해 드립니다.`,
      docKey,
      title,
      version: 1,
      revisionNo: info.revisionNo,
      revisionDate: info.revisionDate,
      changeSummary: null,
      warnings,
    };
  }

  // 예전에 본문을 못 읽어 빈 채로 보관해 둔 같은 파일이 있으면, 새 개정본이 아니라
  // 그 버전을 채워 넣는다 (스캔 문서를 OCR로 다시 읽어낸 경우).
  const emptyTwin = record.versions.find(
    (version) => version.charCount === 0 && version.originalName === originalName,
  );
  if (emptyTwin) {
    await writeVersionText(docKey, emptyTwin.textFile, text);
    emptyTwin.charCount = text.length;
    emptyTwin.ocrUsed = usedOcr;
    await refreshVersionMeta(record, emptyTwin, {
      info,
      sourcePath,
      productFamily,
      categoryLabel: resolvedCategoryLabel,
      manualEntry: Boolean(manual),
      latestStandard,
    });
    await saveRecord(record);

    return {
      status: "updated",
      message: `'${record.title}': 본문을 읽지 못해 비어 있던 v${emptyTwin.version}을 ${
        usedOcr ? "OCR로 읽어" : "다시 읽어"
      } 채웠습니다.`,
      docKey,
      title: record.title,
      version: emptyTwin.version,
      revisionNo: info.revisionNo,
      revisionDate: info.revisionDate,
      changeSummary: emptyTwin.changeSummary,
      warnings,
    };
  }

  // 이미 보관한 개정본인지 확인한다.
  // 최신 버전만 보면 같은 파일을 다시 넣었을 때 버전이 계속 쌓이므로 모든 버전과 대조한다.
  const sameRevision = record.versions.find((version) => isSameRevision(info, version));
  if (sameRevision) {
    const storedText = await readVersionText(docKey, sameRevision.textFile);
    if (hash(storedText) !== hash(text)) {
      warnings.push(
        "개정번호와 개정일자는 이미 보관된 버전과 같은데 본문 내용이 다릅니다. 원본 문서를 확인해 주세요.",
      );
    }
    // 본문은 그대로여도 ★기본정보는 다시 읽어 채운다. 문서에서 정보를 뽑는 규칙이 나중에
    // 좋아져도, 이미 보관된 버전은 처음 보관할 때의 값으로 굳어 있어 다시 스캔해도 바뀌지
    // 않기 때문이다. 새로 읽은 값이 비어 있으면 기존 값을 지우지 않고 그대로 둔다.
    await refreshVersionMeta(record, sameRevision, {
      info,
      sourcePath,
      productFamily,
      categoryLabel: resolvedCategoryLabel,
      manualEntry: Boolean(manual),
      latestStandard,
    });

    return {
      status: "unchanged",
      message: `'${record.title}': 개정번호(${info.revisionNo ?? "없음"})·개정일자(${info.revisionDate ?? "없음"}) 문서가 이미 v${sameRevision.version}으로 보관되어 있습니다.`,
      docKey,
      title: record.title,
      version: sameRevision.version,
      revisionNo: info.revisionNo,
      revisionDate: info.revisionDate,
      changeSummary: sameRevision.changeSummary,
      warnings,
    };
  }

  // 본문이 똑같은 버전이 이미 있으면 새 개정본이 아니다.
  // 개정 정보를 못 찾은 문서뿐 아니라 모든 문서에 적용한다. 문서에서 정보를 뽑는 규칙이
  // 좋아져서 예전에 못 읽던 개정일자를 이번에 읽어내면, 같은 파일인데도 개정번호·개정일자가
  // 달라 보여 같은 문서가 두 버전으로 늘어나기 때문이다.
  {
    const digest = hash(text);
    for (const version of record.versions) {
      const storedText = await readVersionText(docKey, version.textFile);
      if (hash(storedText) === digest) {
        await refreshVersionMeta(record, version, {
          info,
          sourcePath,
          productFamily,
          categoryLabel: resolvedCategoryLabel,
          manualEntry: Boolean(manual),
          latestStandard,
        });

        return {
          status: "unchanged",
          message: `'${record.title}': 본문이 v${version.version}과 완전히 같아 새 버전으로 등록하지 않았습니다.`,
          docKey,
          title: record.title,
          version: version.version,
          revisionNo: info.revisionNo,
          revisionDate: info.revisionDate,
          changeSummary: version.changeSummary,
          warnings,
        };
      }
    }
  }

  // 개정번호를 숫자로 바꿔 "몇 번째 개정인지"를 정한다.
  // 폴더를 훑는 순서는 보장되지 않으므로(예: Original이 담긴 폴더를 나중에 훑을 수 있다),
  // 새로 들어온 파일이 배열 맨 끝에 붙는 것과 무관하게 항상 "바로 이전 개정"·"바로 다음 개정"을
  // 개정번호 기준으로 다시 찾아 비교한다.
  const newRank = revisionRank(info.revisionNo);
  const ranked = record.versions.filter((version) => version.revisionRank !== null);

  let predecessor: DocVersion | null = null;
  let successor: DocVersion | null = null;

  if (newRank !== null && ranked.length === record.versions.length) {
    for (const version of ranked) {
      if (version.revisionRank! < newRank) {
        if (!predecessor || version.revisionRank! > predecessor.revisionRank!) {
          predecessor = version;
        }
      } else if (version.revisionRank! > newRank) {
        if (!successor || version.revisionRank! < successor.revisionRank!) {
          successor = version;
        }
      }
    }
  } else {
    // 개정번호를 숫자로 못 바꾸는 문서가 하나라도 섞여 있으면 순서를 신뢰할 수 없으니
    // 기존처럼 가장 최근에 등록한 버전을 이전 버전으로 본다.
    predecessor = latest;
  }

  if (newRank !== null && ranked.length === record.versions.length && !predecessor && !successor) {
    predecessor = latest;
  }

  const previousText = predecessor ? await readVersionText(docKey, predecessor.textFile) : "";
  const comparison = predecessor ? compareTexts(previousText, text) : null;
  const changeSummary = comparison
    ? await summarizeChange({
        documentTitle: record.title,
        previousLabel: versionLabel(predecessor!),
        currentLabel: `개정번호 ${info.revisionNo ?? "없음"} / 개정일자 ${info.revisionDate ?? "없음"}`,
        comparison,
        comparedWith: {
          version: predecessor!.version,
          revisionNo: predecessor!.revisionNo,
          revisionDate: predecessor!.revisionDate,
        },
        reasonForIssue: info.reasonForIssue,
        caveat: comparisonCaveat(previousText.length, text.length),
      })
    : null;

  const version = await writeVersion({
    docKey,
    versionNo: latest.version + 1,
    buffer,
    text,
    originalName,
    sourcePath,
    info,
    containsPersonalInfo,
    changeSummary,
    productFamily,
    categoryLabel: resolvedCategoryLabel,
    manualEntry: Boolean(manual),
    ocrUsed: usedOcr,
    latestStandard,
  });

  record.versions.push(version);

  // 방금 들어온 문서가 기존에 저장된 어느 버전보다 앞선 개정이라면(예: Amd1·2·3을 먼저
  // 훑은 뒤 나중에 Original을 찾은 경우), 그 바로 다음 개정의 비교 기준이 바뀌므로
  // 다시 계산해 둔다.
  if (successor) {
    const successorText = await readVersionText(docKey, successor.textFile);
    const successorComparison = compareTexts(text, successorText);
    const successorSummary = await summarizeChange({
      documentTitle: record.title,
      previousLabel: versionLabel(version),
      currentLabel: `개정번호 ${successor.revisionNo ?? "없음"} / 개정일자 ${successor.revisionDate ?? "없음"}`,
      comparison: successorComparison,
      comparedWith: {
        version: version.version,
        revisionNo: version.revisionNo,
        revisionDate: version.revisionDate,
      },
      reasonForIssue: successor.reasonForIssue,
      caveat: comparisonCaveat(text.length, successorText.length),
    });
    successor.changeSummary = successorSummary;
    warnings.push(
      `'${successor.originalName}'(개정 ${successor.revisionNo ?? "없음"})의 비교 기준을 이번에 들어온 더 이전 개정으로 다시 계산했습니다.`,
    );
  }

  await saveRecord(record);

  return {
    status: "updated",
    message: predecessor
      ? `'${record.title}' 문서에 개정 ${info.revisionNo ?? "없음"}을(를) 추가하고 변경 내용을 정리했습니다.`
      : `'${record.title}' 문서에 가장 이전 개정을 추가했습니다. (기존에 있던 더 최근 개정들의 비교 기준을 다시 계산했습니다)`,
    docKey,
    title: record.title,
    version: version.version,
    revisionNo: info.revisionNo,
    revisionDate: info.revisionDate,
    changeSummary,
    warnings,
  };
}

/**
 * 이미 보관된 버전의 ★기본정보를 다시 읽은 값으로 갱신한다.
 * 새로 읽은 값이 비어 있으면(null) 기존 값을 그대로 두어, 정보가 지워지는 일이 없게 한다.
 * 예: 카테고리 스캔으로 채운 시험항목이 폴더 전체 스캔 때문에 비워지지 않는다.
 */
async function refreshVersionMeta(
  record: DocRecord,
  version: DocVersion,
  params: {
    info: RevisionInfo;
    sourcePath: string | null;
    productFamily: string | null;
    categoryLabel: string | null;
    manualEntry: boolean;
    latestStandard: { latest: string; source: string | null } | null;
  },
): Promise<void> {
  const { info, sourcePath, productFamily, categoryLabel, manualEntry, latestStandard } = params;
  const before = JSON.stringify(version);

  // 개정번호·개정일자는 버전을 가르는 기준이자 비교 순서를 정하는 값이라, 이미 들어 있는 값은
  // 건드리지 않고 비어 있을 때만 채운다 (예전에 못 읽던 발행일을 이제 읽어낸 경우).
  if (!version.revisionNo && info.revisionNo) {
    version.revisionNo = info.revisionNo;
    version.revisionRank = revisionRank(info.revisionNo);
  }
  if (!version.revisionDate && info.revisionDate) version.revisionDate = info.revisionDate;
  if (version.foundIn === "없음" && info.foundIn !== "없음") version.foundIn = info.foundIn;

  version.sourcePath = sourcePath ?? version.sourcePath;
  version.reportNo = info.reportNo ?? version.reportNo;
  version.model = info.model ?? version.model;
  version.equipmentName = info.equipmentName ?? version.equipmentName;
  version.testingLab = info.testingLab ?? version.testingLab;
  version.appliedStandard = info.appliedStandard ?? version.appliedStandard;
  version.reasonForIssue = info.reasonForIssue ?? version.reasonForIssue;
  version.productFamily = productFamily ?? version.productFamily;
  version.categoryLabel = categoryLabel ?? version.categoryLabel;
  version.manualEntry = manualEntry;
  version.latestStandard = latestStandard?.latest ?? version.latestStandard ?? null;
  version.latestStandardSource = latestStandard?.source ?? version.latestStandardSource ?? null;

  // "변경 요약" 블록의 발행/개정사유는 이 버전을 처음 비교하던 때 계산해 저장해 둔 값이라,
  // 위에서 추출 규칙이 좋아져 더 긴(또는 다른) reasonForIssue를 읽어내도 그대로 남아 있었다.
  // 규칙 기반 요약(generatedBy: "rule")은 headline이 곧 reasonForIssue이므로 둘 다 새 값으로 맞춘다.
  // AI 요약은 별도로 작성한 문장이라 headline은 그대로 두고 근거 문구만 새로 맞춘다.
  if (version.changeSummary && info.reasonForIssue) {
    if (version.changeSummary.reasonForIssue !== info.reasonForIssue) {
      if (version.changeSummary.generatedBy === "rule") {
        version.changeSummary.headline = info.reasonForIssue;
      }
      version.changeSummary.reasonForIssue = info.reasonForIssue;
    }
  }

  if (JSON.stringify(version) !== before) await saveRecord(record);
}

/**
 * CB Test Certificate를 근거가 된 시험성적서(CB Report)의 해당 버전에 첨부한다.
 * 대응하는 성적서를 찾으면 별도 문서를 만들지 않고 여기서 바로 처리를 끝낸다.
 */
async function tryAttachCertificate(params: {
  reportNo: string | null;
  buffer: Buffer;
  originalName: string;
  sourcePath: string | null;
}): Promise<ProcessResult | null> {
  const { reportNo, buffer, originalName, sourcePath } = params;
  if (!reportNo) return null;

  const target = await findVersionByReportNo(reportNo);
  if (!target) return null;

  const { record, version } = target;
  const storedFile = `v${String(version.version).padStart(3, "0")}__certificate__${sanitize(originalName)}`;
  await mkdir(path.join(ARCHIVE_DIR, record.key), { recursive: true });
  await writeFile(path.join(ARCHIVE_DIR, record.key, storedFile), buffer);

  version.certificate = { originalName, sourcePath, storedFile };
  await saveRecord(record);

  return {
    status: "updated",
    message: `CB Test Certificate를 '${record.title}' 성적서(성적서 번호 ${reportNo})의 v${version.version}에 첨부했습니다. 별도 문서로 만들지 않았습니다.`,
    docKey: record.key,
    title: record.title,
    version: version.version,
    revisionNo: version.revisionNo,
    revisionDate: version.revisionDate,
    changeSummary: version.changeSummary,
    warnings: [],
  };
}

/** 성적서 번호(Report Number)로 보관 중인 문서의 해당 버전을 찾는다 */
async function findVersionByReportNo(
  reportNo: string,
): Promise<{ record: DocRecord; version: DocVersion } | null> {
  const entries = await readdir(ARCHIVE_DIR, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const record = await readRecord(entry.name);
    if (!record) continue;
    const version = record.versions.find((item) => item.reportNo === reportNo);
    if (version) return { record, version };
  }
  return null;
}

/**
 * CB 성적서의 개정본은 전체 문서가 아니라 바뀐 부분만 담은 짧은 보고서인 경우가 많다
 * (예: 원본 219쪽 vs 개정 3 33쪽). 두 버전의 분량 차이가 크면 줄 단위 비교가 페이지 구성
 * 차이 때문에 부풀려질 수 있다는 점을 화면에 알려 준다.
 */
function comparisonCaveat(previousLength: number, currentLength: number): string | undefined {
  if (previousLength === 0 || currentLength === 0) return undefined;
  const ratio = Math.min(previousLength, currentLength) / Math.max(previousLength, currentLength);
  if (ratio >= 0.5) return undefined;
  return "두 버전의 분량 차이가 커서 개정본이 전체 문서가 아니라 변경된 부분만 다루는 것으로 보입니다. 아래 문구 비교는 참고용이며, 실제 개정 내용은 위 '발행 및 개정사유'를 기준으로 확인하세요.";
}

/** 개정번호를 정렬 가능한 숫자로 바꾼다. 못 바꾸면 null */
function revisionRank(revisionNo: string | null): number | null {
  if (!revisionNo) return null;
  const parsed = Number(revisionNo);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * 지정한 최상위 폴더와 그 하위 폴더의 문서를 한꺼번에 훑는다.
 * 원본 파일은 읽기만 하고 이동하거나 수정하지 않는다.
 */
export async function scanFolder(params: {
  rootPath: string;
  containsPersonalInfo: boolean;
  force?: boolean;
  batchSize?: number;
}): Promise<ScanSummary> {
  const {
    rootPath,
    containsPersonalInfo,
    force = false,
    batchSize = SCAN_BATCH_SIZE,
  } = params;
  await ensureDirs();

  const { files, deferredCount, reachedLimit } = await collectFiles(rootPath);
  const cache = force ? {} : await readScanCache();
  const productFamily = path.basename(rootPath);
  const { results, remaining, skippedCount, failedSkipped } = await processFileList({
    files,
    cache,
    containsPersonalInfo,
    batchSize,
    describe: () => ({ productFamily, categoryLabel: null }),
  });
  await writeScanCache(cache);

  return {
    rootPath,
    results,
    skippedCount,
    foundCount: files.length,
    remaining,
    message: buildScanMessage({
      foundCount: files.length,
      results,
      skippedCount,
      failedSkipped,
      deferredCount,
      reachedLimit,
      remaining,
    }),
  };
}

/**
 * 지정한 카테고리 폴더들만 훑는다 (예: POTENZA의 Safety·EMC·멸균 밸리데이션 등 12개 항목).
 * 각 결과에 어느 카테고리에서 나온 문서인지 표시한다. 폴더가 없는 카테고리는
 * 결과 없이 그대로 보고한다.
 */
export async function scanCategories(params: {
  rootPath: string;
  categories: DocCategory[];
  containsPersonalInfo: boolean;
  force?: boolean;
  batchSize?: number;
}): Promise<CategoryScanSummary> {
  const {
    rootPath,
    categories,
    containsPersonalInfo,
    force = false,
    batchSize = SCAN_BATCH_SIZE,
  } = params;
  await ensureDirs();

  const fileToCategory = new Map<string, DocCategory>();
  const missingFolders: { category: DocCategory; folder: string }[] = [];

  for (const { category, folder } of categoryFolderPaths(rootPath, categories)) {
    const exists = await stat(folder).catch(() => null);
    if (!exists) {
      missingFolders.push({ category, folder });
      continue;
    }
    const { files } = await collectFiles(folder);
    for (const filePath of files) fileToCategory.set(filePath, category);
  }

  const files = [...fileToCategory.keys()];
  const cache = force ? {} : await readScanCache();
  const productFamily = path.basename(rootPath);
  const { results, remaining, skippedCount, failedSkipped } = await processFileList({
    files,
    cache,
    containsPersonalInfo,
    batchSize,
    describe: (filePath) => ({
      productFamily,
      categoryLabel: fileToCategory.get(filePath)?.label ?? null,
    }),
  });
  await writeScanCache(cache);

  // 카테고리 화면은 "이번 호출에서 처리한 파일"이 아니라 지금까지 보관된 전체 문서를
  // 기준으로 다시 계산한다. 스캔은 여러 번에 걸쳐 나눠 실행되므로, 마지막 호출에서
  // 건드린 파일만 보여주면 앞선 호출에서 처리한 문서가 화면에서 사라져 보인다.
  const documents = await listDocuments();
  const categoryReports: CategoryReport[] = categories.map((category) => {
    const categoryDocs = documents.filter((record) => {
      const latest = latestVersion(record);
      return latest?.sourcePath
        ? categorize(rootPath, latest.sourcePath, [category]) !== null
        : false;
    });
    const hasFolders = category.folders.length > 0;
    return {
      key: category.key,
      label: category.label,
      documents: categoryDocs,
      fileCount: categoryDocs.length,
      status: !hasFolders
        ? "no-folder"
        : categoryDocs.length === 0 &&
            missingFolders.some((entry) => entry.category.key === category.key)
          ? "folder-missing"
          : "ok",
    };
  });

  return {
    rootPath,
    categories: categoryReports,
    remaining,
    message: `카테고리 ${categories.length}개 확인 · 처리 ${results.length}건 · 지난번과 같아 건너뜀 ${skippedCount}건${
      failedSkipped > 0 ? ` · 이전 실패로 잠시 보류 ${failedSkipped}건` : ""
    }${remaining > 0 ? ` · 남은 ${remaining}건은 "이어서 스캔"을 눌러 주세요` : ""}`,
  };
}

/** 여러 파일을 배치 단위로 처리하는 공통 로직 (scanFolder·scanCategories가 함께 쓴다) */
async function processFileList(params: {
  files: string[];
  cache: ScanCache;
  containsPersonalInfo: boolean;
  batchSize: number;
  /** 파일별 ★기본정보(제품군·시험항목)를 붙여 준다 */
  describe?: (filePath: string) => { productFamily: string | null; categoryLabel: string | null };
}): Promise<{
  results: ProcessResult[];
  processedFiles: string[];
  remaining: number;
  skippedCount: number;
  failedSkipped: number;
}> {
  const { files, cache, containsPersonalInfo, batchSize, describe } = params;
  const results: ProcessResult[] = [];
  const processedFiles: string[] = [];
  let skippedCount = 0;
  let failedSkipped = 0;
  let processed = 0;

  // 지난번과 달라진 파일만 골라 둔다
  const pending: { filePath: string; info: Stats }[] = [];
  for (const filePath of files) {
    const info = await stat(filePath).catch(() => null);
    if (!info) continue;

    const cached = cache[filePath];
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
      if (!cached.failedAt) {
        skippedCount += 1;
        continue;
      }
      // 실패한 파일이 매번 다시 시도되어 진행을 막지 않도록 잠시 쉬었다 재시도한다
      if (Date.now() - cached.failedAt < FAILURE_COOLDOWN_MS) {
        failedSkipped += 1;
        continue;
      }
    }
    pending.push({ filePath, info });
  }

  // 한 번에 너무 오래 걸리지 않도록 정해진 개수만 처리하고 나머지는 다음 호출로 넘긴다
  const batch = pending.slice(0, batchSize);

  for (const { filePath, info } of batch) {
    if (info.size > MAX_FILE_BYTES) {
      results.push({
        status: "error",
        message: `${path.basename(filePath)}: 파일이 너무 커서 건너뛰었습니다 (${Math.round(info.size / 1024 / 1024)}MB).`,
        warnings: [],
      });
      processedFiles.push(filePath);
      continue;
    }

    // 경로가 길면 OneDrive가 파일을 내려받지 못하므로 미리 걸러 안내한다
    if (process.platform === "win32" && filePath.length >= MAX_WINDOWS_PATH) {
      results.push({
        status: "error",
        message: `${path.basename(filePath)}: 파일 경로가 ${filePath.length}자로 Windows 한도(${MAX_WINDOWS_PATH}자)를 넘어 본문을 읽을 수 없습니다. 폴더 이름을 줄이거나 파일을 옮겨 주세요.`,
        warnings: [],
      });
      processedFiles.push(filePath);
      cache[filePath] = {
        mtimeMs: info.mtimeMs,
        size: info.size,
        failedAt: Date.now(),
      };
      continue;
    }

    // 파일 하나가 실패해도 나머지 스캔은 계속한다.
    // OneDrive 온라인 전용 파일은 내려받지 못하면 여기서 오류가 난다.
    let result: ProcessResult;
    try {
      const buffer = await readWithRetry(filePath);
      const meta = describe?.(filePath) ?? { productFamily: null, categoryLabel: null };
      result = await processIncoming({
        buffer,
        originalName: path.basename(filePath),
        containsPersonalInfo,
        sourcePath: filePath,
        productFamily: meta.productFamily,
        categoryLabel: meta.categoryLabel,
      });
    } catch (error) {
      result = {
        status: "error",
        message: `${path.basename(filePath)}: ${describeReadError(error)}`,
        warnings: [],
      };
    }
    results.push(result);
    processedFiles.push(filePath);

    cache[filePath] =
      result.status === "error"
        ? { mtimeMs: info.mtimeMs, size: info.size, failedAt: Date.now() }
        : { mtimeMs: info.mtimeMs, size: info.size };

    // 오래 걸리는 스캔이 중간에 끊겨도 진행분을 잃지 않도록 주기적으로 저장한다
    processed += 1;
    if (processed % 25 === 0) await writeScanCache(cache);
  }

  return {
    results,
    processedFiles,
    remaining: pending.length - batch.length,
    skippedCount,
    failedSkipped,
  };
}

/** 챗봇이 근거로 삼을 문서 본문과 요약을 하나의 텍스트로 모은다 */
export async function buildChatContext(): Promise<string> {
  const records = await listDocuments();
  const blocks: string[] = [];
  for (const record of records) blocks.push(await describeRecord(record));
  return blocks.join("\n\n");
}

/** 질문이 지목한 문서 한 건만 근거로 정리한다 */
export async function buildFocusedContext(record: DocRecord): Promise<string> {
  return describeRecord(record);
}

async function describeRecord(record: DocRecord): Promise<string> {
  const ordered = orderVersions(record.versions);
  const latest = ordered.at(-1);
  if (!latest) return "";

  const text = await readVersionText(record.key, latest.textFile);
  const summaries = ordered
    .filter((version) => version.changeSummary)
    .map((version) => {
      const summary = version.changeSummary!;
      const items = summary.items
        .map((item) => `    - (${item.clause}) ${item.summary}`)
        .join("\n");
      return `  v${version.version} (${versionLabel(version)}): ${summary.headline}\n${items}`;
    })
    .join("\n");

  // OCR로 읽은 본문은 기계가 알아본 글자라 오탈자가 섞인다. 챗봇이 이를 알고 답하도록 알려 준다.
  const readingNote = latest.ocrUsed
    ? "\n- 주의: 이 문서는 스캔본이라 OCR로 읽었습니다. 글자가 잘못 읽혔을 수 있으니 숫자·모델명을 단정하지 말고 원본 확인을 함께 안내하세요."
    : "";

  return `### 문서명: ${record.title}
- 최신 버전: v${latest.version} / 개정번호 ${latest.revisionNo ?? "없음"} / 개정일자 ${latest.revisionDate ?? "없음"}${readingNote}
- 변경 이력:
${summaries || "  (변경 이력 없음)"}
- 최신 본문:
${text.slice(0, CHAT_CONTEXT_CHARS)}`;
}

/** 폴더를 재귀적으로 훑어 처리 대상 파일 경로를 모은다 */
async function collectFiles(rootPath: string): Promise<{
  files: string[];
  deferredCount: number;
  reachedLimit: boolean;
}> {
  const files: string[] = [];
  let deferredCount = 0;
  let reachedLimit = false;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_SCAN_DEPTH || reachedLimit) return;

    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (reachedLimit) return;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // 숨김 폴더와 보관 폴더는 건너뛴다
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        if (path.resolve(full) === path.resolve(ARCHIVE_DIR)) continue;
        // IFU·라벨 폴더에는 시험성적서가 아닌 부속 자료(라벨 도안 등)만 있어 통째로 건너뛴다
        if (isExcludedFolder(entry.name)) continue;
        await walk(full, depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;
      // 시험성적서가 아닌 부속 자료(IFU·장비명판·라벨·멸균지 등)는 훑지 않는다
      if (isExcludedFromScan(entry.name)) continue;
      const ext = path.extname(entry.name).toLowerCase();

      if ((DEFERRED_EXTENSIONS as readonly string[]).includes(ext)) {
        deferredCount += 1;
        continue;
      }
      if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) continue;

      files.push(full);
      if (files.length >= MAX_SCAN_FILES) reachedLimit = true;
    }
  }

  await walk(rootPath, 0);
  return { files: sortCertificatesLast(files), deferredCount, reachedLimit };
}

/**
 * CB Test Certificate로 보이는 파일을 목록 맨 뒤로 미룬다. 짝이 되는 CB Report(시험성적서)가
 * 같은 스캔에서 먼저 처리·보관되어야 인증서를 성적서 번호로 찾아 첨부할 수 있기 때문이다.
 */
function sortCertificatesLast(files: string[]): string[] {
  const normal: string[] = [];
  const certificates: string[] = [];
  for (const file of files) {
    if (CB_CERTIFICATE_FILENAME_PATTERN.test(path.basename(file))) {
      certificates.push(file);
    } else {
      normal.push(file);
    }
  }
  return [...normal, ...certificates];
}

function describeReadError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "UNKNOWN" || code === "EIO") {
    return "OneDrive에서 파일을 내려받지 못했습니다. 탐색기에서 해당 파일을 열어 내려받은 뒤 다시 시도해 주세요.";
  }
  if (code === "EBUSY" || code === "EPERM") {
    return "다른 프로그램이 파일을 쓰고 있어 읽지 못했습니다.";
  }
  return `파일을 읽지 못했습니다 (${error instanceof Error ? error.message : String(error)})`;
}

function buildScanMessage(params: {
  foundCount: number;
  results: ProcessResult[];
  skippedCount: number;
  failedSkipped: number;
  deferredCount: number;
  reachedLimit: boolean;
  remaining: number;
}): string {
  const {
    foundCount,
    results,
    skippedCount,
    failedSkipped,
    deferredCount,
    reachedLimit,
    remaining,
  } = params;

  if (foundCount === 0) {
    return deferredCount > 0
      ? `처리할 수 있는 문서가 없습니다. HWP 파일 ${deferredCount}건은 이번 POC에서 지원하지 않습니다.`
      : "폴더에서 PDF, TXT, MD 문서를 찾지 못했습니다.";
  }

  const updated = results.filter((result) => result.status === "updated").length;
  const created = results.filter((result) => result.status === "created").length;
  const unchanged = results.filter((result) => result.status === "unchanged").length;
  const failed = results.filter((result) => result.status === "error").length;

  const parts = [`문서 ${foundCount}건 확인`];
  if (created) parts.push(`신규 ${created}건`);
  if (updated) parts.push(`변경 ${updated}건`);
  if (unchanged) parts.push(`변경 없음 ${unchanged}건`);
  if (skippedCount) parts.push(`지난번과 같아 건너뜀 ${skippedCount}건`);
  if (failed) parts.push(`실패 ${failed}건`);
  if (failedSkipped) parts.push(`이전 실패로 잠시 보류 ${failedSkipped}건`);
  if (deferredCount) parts.push(`HWP 미지원 ${deferredCount}건`);
  if (remaining > 0) parts.push(`남은 ${remaining}건은 "이어서 스캔"을 눌러 주세요`);
  if (reachedLimit) parts.push(`※ 한 번에 ${MAX_SCAN_FILES}건까지만 처리합니다`);

  return parts.join(" · ");
}

type ScanCache = Record<
  string,
  { mtimeMs: number; size: number; failedAt?: number }
>;

/** 읽기에 실패한 파일을 다시 시도하기까지 기다리는 시간 (30분) */
const FAILURE_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * OneDrive 온라인 전용 파일은 처음 읽을 때 내려받다가 실패하는 경우가 있어
 * 한 번 더 시도한다.
 */
async function readWithRetry(filePath: string): Promise<Buffer> {
  try {
    return await readFile(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "UNKNOWN" && code !== "EIO" && code !== "EBUSY") throw error;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return readFile(filePath);
  }
}

async function readScanCache(): Promise<ScanCache> {
  try {
    return JSON.parse(await readFile(SCAN_CACHE_FILE, "utf8")) as ScanCache;
  } catch {
    return {};
  }
}

async function writeScanCache(cache: ScanCache): Promise<void> {
  await writeFile(SCAN_CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

async function readRecord(docKey: string): Promise<DocRecord | null> {
  try {
    const raw = await readFile(path.join(ARCHIVE_DIR, docKey, "meta.json"), "utf8");
    const record = JSON.parse(raw) as DocRecord;
    return { ...record, aliases: record.aliases ?? [] };
  } catch {
    return null;
  }
}

function mergeAliases(existing: string[], incoming: string[]): string[] {
  return [...new Set([...existing, ...incoming])];
}

async function saveRecord(record: DocRecord): Promise<void> {
  const dir = path.join(ARCHIVE_DIR, record.key);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "meta.json"),
    JSON.stringify(record, null, 2),
    "utf8",
  );
}

/** 보관된 본문 텍스트를 덮어쓴다 (읽지 못했던 문서를 다시 읽어냈을 때) */
async function writeVersionText(docKey: string, textFile: string, text: string): Promise<void> {
  await writeFile(path.join(ARCHIVE_DIR, docKey, textFile), text, "utf8");
}

async function readVersionText(docKey: string, textFile: string): Promise<string> {
  try {
    return await readFile(path.join(ARCHIVE_DIR, docKey, textFile), "utf8");
  } catch {
    return "";
  }
}

async function writeVersion(params: {
  docKey: string;
  versionNo: number;
  buffer: Buffer;
  text: string;
  originalName: string;
  sourcePath: string | null;
  info: RevisionInfo;
  containsPersonalInfo: boolean;
  changeSummary: DocVersion["changeSummary"];
  productFamily: string | null;
  categoryLabel: string | null;
  manualEntry: boolean;
  ocrUsed: boolean;
  latestStandard: { latest: string; source: string | null } | null;
}): Promise<DocVersion> {
  const { docKey, versionNo, buffer, text, originalName, info } = params;
  const dir = path.join(ARCHIVE_DIR, docKey);
  await mkdir(dir, { recursive: true });

  const padded = String(versionNo).padStart(3, "0");
  const storedFile = `v${padded}__${sanitize(originalName)}`;
  const textFile = `v${padded}.txt`;

  // 이전 버전 파일은 그대로 두고 새 파일만 추가한다 (PRD Must 1: 버전 보존)
  await writeFile(path.join(dir, storedFile), buffer);
  await writeFile(path.join(dir, textFile), text, "utf8");

  return {
    version: versionNo,
    originalName,
    sourcePath: params.sourcePath,
    storedFile,
    textFile,
    revisionNo: info.revisionNo,
    revisionDate: info.revisionDate,
    foundIn: info.foundIn,
    revisionRank: revisionRank(info.revisionNo),
    reportNo: info.reportNo,
    uploadedAt: new Date().toISOString(),
    charCount: text.length,
    containsPersonalInfo: params.containsPersonalInfo,
    changeSummary: params.changeSummary,
    model: info.model,
    equipmentName: info.equipmentName,
    testingLab: info.testingLab,
    appliedStandard: info.appliedStandard,
    reasonForIssue: info.reasonForIssue,
    productFamily: params.productFamily,
    categoryLabel: params.categoryLabel,
    manualEntry: params.manualEntry,
    ocrUsed: params.ocrUsed,
    latestStandard: params.latestStandard?.latest ?? null,
    latestStandardSource: params.latestStandard?.source ?? null,
    certificate: null,
  };
}

function versionLabel(version: DocVersion): string {
  return `개정번호 ${version.revisionNo ?? "없음"} / 개정일자 ${version.revisionDate ?? "없음"}`;
}

function sanitize(fileName: string): string {
  return path.basename(fileName).replace(/[^0-9A-Za-z가-힣._-]+/g, "_");
}

function hash(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}
