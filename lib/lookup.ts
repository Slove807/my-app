import path from "node:path";
import type { DocRecord, DocVersion } from "./types";
import { latestVersion, orderVersions } from "./versions";

export type LookupResult =
  | { kind: "matched"; record: DocRecord }
  | { kind: "ambiguous"; candidates: DocRecord[] }
  | { kind: "none" };

/** 질문에 등장한 문서명을 보관 중인 문서와 맞춰본다 */
export function findDocument(records: DocRecord[], question: string): LookupResult {
  if (records.length === 0) return { kind: "none" };

  const target = normalize(question);
  const scored = records
    .map((record) => ({ record, score: scoreRecord(record, target) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  // 문서명을 언급하지 않았어도 보관 문서가 하나뿐이면 그 문서로 본다
  if (scored.length === 0) {
    return records.length === 1
      ? { kind: "matched", record: records[0] }
      : { kind: "none" };
  }

  const best = scored[0];
  const tied = scored.filter((entry) => entry.score === best.score);
  if (tied.length > 1) {
    return { kind: "ambiguous", candidates: tied.map((entry) => entry.record) };
  }

  return { kind: "matched", record: best.record };
}

/** ★기본정보 항목 중 하나를 콕 집어 물었을 때 답하는 패턴. 더 구체적인 표현부터 확인한다 */
const FIELD_PATTERNS: {
  pattern: RegExp;
  label: string;
  get: (v: DocVersion) => string | null;
}[] = [
  { pattern: /상세\s*시험\s*항목/, label: "상세 시험항목", get: (v) => v.detailedTestItem },
  { pattern: /시험\s*항목/, label: "시험항목", get: (v) => v.categoryLabel },
  { pattern: /성적서\s*번호/, label: "성적서 번호", get: (v) => v.certificateNo },
  { pattern: /보고서\s*번호/, label: "보고서 번호", get: (v) => v.reportNo },
  { pattern: /시험\s*기관/, label: "시험기관", get: (v) => v.testingLab },
  { pattern: /모델\s*명/, label: "모델명", get: (v) => v.model },
  { pattern: /품목\s*명/, label: "품목명", get: (v) => v.equipmentName },
  { pattern: /제품\s*군/, label: "제품군", get: (v) => v.productFamily },
  { pattern: /최신\s*규격/, label: "최신 규격", get: (v) => v.latestStandard },
  { pattern: /적용\s*규격/, label: "적용 규격", get: (v) => v.appliedStandard },
  { pattern: /개정\s*번호/, label: "개정번호", get: (v) => v.revisionNo },
  { pattern: /발행일|개정일자/, label: "발행일", get: (v) => v.revisionDate },
  { pattern: /작성\s*언어/, label: "작성 언어", get: (v) => v.writtenLanguage },
];

/** "변경사항 알려줘"류 질문으로 판단하는 표현 */
const CHANGE_PATTERN = /변경|바뀐|바뀌었|달라진|개정\s*(내용|이력|사항)/;

/**
 * AI 키 없이도 문서 하나를 두고 묻는 질문에 답한다.
 * 1) "변경사항"류 질문 → 기본정보 기준 변경 이력만 정리해 답한다 (본문 줄 단위 비교는 화면의
 *    "본문 줄 단위 비교 상세 보기"에서 직접 확인하도록 남겨 둔다).
 * 2) ★기본정보 항목을 콕 집어 물었으면 그 항목만 답한다.
 * 3) 둘 다 아니면 ★기본정보 전체를 정리해 보여준다 — "이 자료에 뭐가 있어?" 같은 질문에도
 *    빈손으로 돌아가지 않도록 한다.
 */
export function answerFromRecord(record: DocRecord, question: string): string {
  const ordered = orderVersions(record.versions);
  const latest = ordered.at(-1);
  if (!latest) return `'${record.title}' 문서에 보관된 버전이 없습니다.`;

  if (CHANGE_PATTERN.test(question)) {
    return describeBasicInfoChange(record);
  }

  for (const field of FIELD_PATTERNS) {
    if (!field.pattern.test(question)) continue;
    const value = field.get(latest);
    if (!value) {
      return `'${record.title}'에서는 ${field.label} 정보가 확인되지 않습니다.\n\n근거: ${record.title} 최신 버전 기본정보`;
    }
    const source =
      field.label === "최신 규격" && latest.latestStandardSource
        ? ` (확인 근거: ${latest.latestStandardSource})`
        : "";
    return `'${record.title}'의 ${field.label}: ${value}${source}\n\n근거: ${record.title} 최신 버전 기본정보`;
  }

  return describeBasicInfo(record, latest);
}

/** ★기본정보 전체를 정리해 보여준다 (질문이 특정 항목을 콕 집지 않았을 때) */
function describeBasicInfo(record: DocRecord, latest: DocVersion): string {
  const rows: [string, string | null][] = [
    ["제품군", latest.productFamily],
    ["품목명", latest.equipmentName],
    ["모델명", latest.model],
    ["시험항목", latest.categoryLabel],
    ["상세 시험항목", latest.detailedTestItem],
    ["보고서 번호", latest.reportNo],
    ["성적서 번호", latest.certificateNo],
    ["시험기관", latest.testingLab],
    ["발행일", latest.revisionDate],
    ["개정번호", latest.revisionNo],
    ["적용 규격", latest.appliedStandard],
    ["최신 규격", latest.latestStandard],
    ["작성 언어", latest.writtenLanguage],
  ];
  const known = rows.filter(([, value]) => value);

  const lines = [`'${record.title}'의 기본정보(최신 버전 기준)입니다.`, ""];
  if (known.length === 0) {
    lines.push("본문에서 확인된 기본정보가 없습니다.");
  } else {
    for (const [label, value] of known) lines.push(`- ${label}: ${value}`);
  }
  lines.push("", `근거: ${record.title} 최신 버전 기본정보`);
  return lines.join("\n");
}

/** ★기본정보에 적힌 내용을 기준으로만 변경 이력을 정리한다 (본문 줄 단위 비교는 포함하지 않는다) */
export function describeBasicInfoChange(record: DocRecord): string {
  const ordered = orderVersions(record.versions);
  const latest = ordered.at(-1);
  if (!latest) return `'${record.title}' 문서에 보관된 버전이 없습니다.`;

  // 내부 저장 번호는 훑은 순서를 따르므로, 개정 순서를 기준으로 다시 매긴 번호를 답변에 쓴다
  const displayNo = new Map(ordered.map((version, index) => [version.version, index + 1]));
  const label = (versionNo: number) => displayNo.get(versionNo) ?? versionNo;
  const head = `'${record.title}'의 최신 버전은 v${label(latest.version)}입니다. (개정번호 ${latest.revisionNo ?? "없음"} / 개정일자 ${latest.revisionDate ?? "없음"})`;

  const previous = ordered.at(-2);
  if (!previous) {
    return `${head}\n\n가장 처음 버전이라 비교할 이전 문서가 없습니다.`;
  }

  const fields: { label: string; get: (v: DocVersion) => string | null }[] = [
    { label: "제품군", get: (v) => v.productFamily },
    { label: "품목명", get: (v) => v.equipmentName },
    { label: "모델명", get: (v) => v.model },
    { label: "시험항목", get: (v) => v.categoryLabel },
    { label: "상세 시험항목", get: (v) => v.detailedTestItem },
    { label: "보고서 번호", get: (v) => v.reportNo },
    { label: "성적서 번호", get: (v) => v.certificateNo },
    { label: "시험기관", get: (v) => v.testingLab },
    { label: "개정번호", get: (v) => v.revisionNo },
    { label: "발행일", get: (v) => v.revisionDate },
    { label: "적용 규격", get: (v) => v.appliedStandard },
    { label: "최신 규격", get: (v) => v.latestStandard },
  ];

  const changed = fields
    .map((f) => ({ label: f.label, before: f.get(previous), after: f.get(latest) }))
    .filter((f) => (f.before ?? "") !== (f.after ?? "") && (f.before || f.after));

  const lines = [
    head,
    `비교 대상: v${label(previous.version)} (개정번호 ${previous.revisionNo ?? "없음"} / 개정일자 ${previous.revisionDate ?? "없음"})`,
    "",
  ];

  if (latest.changeSummary?.reasonForIssue) {
    lines.push(`발행 및 개정사유(문서에 명시된 근거): ${latest.changeSummary.reasonForIssue}`, "");
  }

  if (changed.length === 0) {
    lines.push("기본정보 상으로는 달라진 항목이 없습니다.");
  } else {
    lines.push("기본정보 변경:");
    for (const c of changed) {
      lines.push(`- ${c.label}: ${c.before ?? "없음"} → ${c.after ?? "없음"}`);
    }
  }

  lines.push("", `근거: ${record.title} v${label(latest.version)}`);
  return lines.join("\n");
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

function scoreRecord(record: DocRecord, target: string): number {
  const latest = latestVersion(record);
  const candidates = [
    record.title,
    record.key,
    ...(record.aliases ?? []),
    latest ? path.basename(latest.originalName, path.extname(latest.originalName)) : "",
  ].filter(Boolean);

  let score = 0;

  for (const candidate of candidates) {
    // 문서명 전체가 질문에 들어 있으면 가장 확실한 근거다
    const whole = normalize(candidate);
    if (whole.length >= 2 && target.includes(whole)) {
      score = Math.max(score, whole.length * 2);
    }

    for (const token of candidate.split(/[^0-9A-Za-z가-힣]+/)) {
      const normalized = normalize(token);
      if (normalized.length >= 2 && target.includes(normalized)) {
        score += normalized.length;
      }
    }
  }

  return score;
}
