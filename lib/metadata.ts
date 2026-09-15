import path from "node:path";
import type { RevisionInfo } from "./types";

// PRD Must 1 규칙: 변경 여부는 개정번호와 개정일자를 기준으로 판단한다.
// 문서 양식이 두 가지라 각각 다르게 읽는다.
//  (1) 인증기관 시험성적서(CB Test Report) — "Amendment No. 3: 2026-05-08"
//  (2) 국문 사내 규정 — "개정번호: 2 / 개정일자: 2026-08-17"

// --- (1) 인증기관 시험성적서 ---
const CB_MARKER = /TRF No\.|Test Report Form No\./;
const CB_AMENDMENT = /Amendment No\.\s*([0-9]+)\s*:\s*([0-9]{4})-([0-9]{2})-([0-9]{2})/;
const CB_ISSUE_DATE = /Date of issue[^\n:]*:\s*([0-9]{4})-([0-9]{2})-([0-9]{2})/;
const CB_MODEL = /Model\/Type reference[^\n:]*:\s*([^\n]+)/;
// 표지에는 "Test Report Form No.", 다음 페이지부터는 "TRF No."로 표기가 다르다
const CB_TRF = /(?:Test Report Form No\.|TRF No\.)[^\n:]*:?\s*([A-Za-z0-9_]+)/;
// 일부 시험기관(예: Nemko의 예전 서식)은 문자 없이 순수 숫자로만 성적서 번호를 매기고(예: 407809),
// 뒤에 "_1" 같은 꼬리표가 붙기도 한다(예: 380442_1)
const CB_REPORT_NO = /Report Number[^\n:]*:\s*([A-Za-z]*[0-9]+(?:[_-][A-Za-z0-9]+)?)/;
// 개정본은 "...shall be used together with the Original test report No. REPxxxxx..."로
// 원본 성적서 번호를 명시한다. 줄바꿈으로 끊길 수 있어 공백을 정리한 뒤 찾는다.
const CB_ORIGINAL_REF = /Original test report\s*No\.?\s*([A-Z]{2,}[0-9]+)/i;
// 개정 사유: "The updates concerned in this report are (as follows); - ..."
// 각주(*) 앞까지만 잘라낸다. 문장이 길 수 있어 넉넉히 잡고 뒤에서 길이를 자른다.
const CB_REASON =
  /The updates concerned in this (?:test )?report (?:are|is)(?: as follows)?[;:]?\s*(.+?)(?=\s*\*+\)|$)/i;
// 시험기관 표기는 두 가지다.
//  (a) "... : Nemko Korea Co., Ltd." — 콜론과 같은 줄에 기관명이 있고 바로 다음 줄이 Applicant
//  (b) "... :" 다음 줄에 기관명, 그 아래로 주소가 2~3줄 이어진 뒤에야 Applicant
// 예전 정규식은 콜론부터 Applicant까지가 한 줄일 때만 맞아, 주소가 여러 줄인 (b) 서식에서는
// 시험기관이 통째로 비었다. 콜론 뒤 첫 줄(기관명)만 읽어 두 서식 모두 처리한다.
const CB_LAB = /Name of Testing Laboratory\s*preparing the Report[.\s]*:\s*([^\n]+)/i;
const CB_TEST_ITEM = /Test item description[.\s]*:\s*(.+?)\s*Trade Mark/i;
// 규격 번호가 페이지 폭에 걸려 줄바꿈되는 경우가 있어 [\s\S]로 줄바꿈도 건너뛰게 한다.
// EMC 성적서 표지에는 "Collateral Standard: ELECTROMAGNETIC disturbances..."처럼 점(leader dot) 없이
// "Standard:"가 먼저 나오는 문장이 있어, 점 2개 이상(표 형식의 leader dot)이 뒤따르는 경우만
// 실제 "Test specification: Standard....: IEC ..." 필드로 인정한다 (그렇지 않으면 그 문장부터
// 한참 뒤의 진짜 필드까지 통째로 캡처되어 적용 규격에 엉뚱한 내용이 섞인다).
const CB_STANDARD = /(?<!Non-)Standard\s*\.{2,}\s*:\s*([\s\S]+?)\s*Test procedure/i;

// --- (3) CB Test Certificate (CB Report와 별도 문서로 다루지 않고, 근거가 된 성적서 번호만 뽑아 그 성적서에 귀속시킨다) ---
const CB_CERT_MARKER = /CB\s*TEST\s*CERTIFICATE/i;
// "Test Report Ref. No. ... REP035265" 또는 불어 병기본 "... constitue partie de ce Certificat ... 407809"
// 형식 둘 다, 안내 문구 뒤에 혼자 줄을 이루는 성적서 번호를 찾는다.
const CB_CERT_REPORT_REF =
  /(?:Test Report Ref\.?\s*No\.?|constitue partie de ce Certificat)[\s\S]{0,250}?\n([A-Za-z0-9]{5,})\n/i;

// --- (2) 국문 사내 규정 ---
const REVISION_NO_PATTERNS = [
  /개정\s*(?:번호|차수|차)\s*[:：]?\s*제?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:차|호|판)?/,
  /(?:Rev|REV|rev)\.?\s*(?:No\.?)?\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)/,
  /(?:버전|Version|version)\s*[:：]?\s*[vV]?([0-9]+(?:\.[0-9]+)?)/,
  /제\s*([0-9]+)\s*차\s*개정/,
];

const REVISION_DATE_PATTERNS = [
  /개정\s*(?:일자|일)\s*[:：]?\s*([0-9]{4})\s*[-.\/년]\s*([0-9]{1,2})\s*[-.\/월]\s*([0-9]{1,2})/,
  /시행\s*(?:일자|일)\s*[:：]?\s*([0-9]{4})\s*[-.\/년]\s*([0-9]{1,2})\s*[-.\/월]\s*([0-9]{1,2})/,
  /제정\s*(?:일자|일)\s*[:：]?\s*([0-9]{4})\s*[-.\/년]\s*([0-9]{1,2})\s*[-.\/월]\s*([0-9]{1,2})/,
];

const TITLE_PATTERN = /(?:문서\s*)?(?:제목|문서명)\s*[:：]\s*(.+)/;

// --- (4) 사내(제이시스) 자체 작성 보고서 ---
// 외부 시험기관 성적서가 아니라 회사가 직접 쓴 보고서다. 쪽마다 반복되는 머리말에
// 문서번호·개정번호·발행일이 들어 있고, 표기가 두 가지다.
//  (a) "Doc. No. JE-PZ-LAR / Initial prepared 2019.03.12 / Rev 0 / POTENZA Page 1 / 11"
//  (b) "Document No. JE-PZC-SLR-001 / Revision No. Rev. 0 / Date 2023.10.12"
const INHOUSE_MARKER = /Jeisys Medical Inc\.|JEOP-[0-9]+/i;
const INHOUSE_DOC_NO = /Doc(?:ument)?\.?\s*No\.?\s*[:.]?\s*([A-Z][A-Z0-9-]{3,})/i;
const INHOUSE_REVISION_PATTERNS = [
  /Revision No\.\s*Rev\.?\s*([0-9]+)/i,
  // 머리말에서 한 줄을 통째로 차지하는 "Rev 0". 양식 자체의 개정번호를 뜻하는
  // "JEOP-705 Rev. No.(REV.0)"과 헷갈리지 않도록 줄 시작에서만 찾는다.
  /\n\s*Rev\.?\s+([0-9]+)\s*\n/,
];
const INHOUSE_DATE_PATTERNS = [
  /Initial(?:ly)?\s*prepared\s*([0-9]{4})\s*[.\-/]\s*([0-9]{1,2})\s*[.\-/]\s*([0-9]{1,2})/i,
  /\nDate\s+([0-9]{4})\s*[.\-/]\s*([0-9]{1,2})\s*[.\-/]\s*([0-9]{1,2})/,
];
// 머리말에서 쪽 번호 왼쪽에 붙는 제품명 (예: "POTENZA Page 1 / 11")
const INHOUSE_MODEL = /\n([A-Za-z][A-Za-z0-9 .-]{1,30}?)\s+Page\s*[0-9]+\s*\/\s*[0-9]+/;
// 파일명 앞머리의 대괄호 제품명 (예: "[POTENZA] JE-PZ-LAR Lifetime Analysis Report_EN.pdf")
const INHOUSE_FILE_MODEL = /^\[([^\]]{1,40})\]/;
// 개정 이력표의 첫 줄 (예: "0 2019.03.12 Initially prepared", "0 2023.10.12 - Newly established")
const INHOUSE_HISTORY =
  /Revision History[\s\S]{0,300}?\n\s*([0-9]+)\s+[0-9]{4}[.\-/][0-9]{1,2}[.\-/][0-9]{1,2}\s+(?:-\s+)?([^\n]+)/i;

// 파일명에 붙는 개정 표기: (Amd 1), (Amd.3), (Original)
const FILE_AMENDMENT = /\(\s*Amd\.?\s*([0-9]+)\s*\)/i;
const FILE_ORIGINAL = /\(\s*Original\s*\)/i;

/** 본문과 파일명에서 제목, 개정번호, 개정일자를 뽑아낸다 */
export function extractRevisionInfo(text: string, fileName: string): RevisionInfo {
  const head = text.slice(0, 8000);
  return CB_MARKER.test(head)
    ? readCbReport(head, text, fileName)
    : readKoreanRegulation(head, fileName);
}

/** 인증기관 시험성적서에서 개정 정보와 모델을 읽는다 */
function readCbReport(head: string, fullText: string, fileName: string): RevisionInfo {
  const model = matchText(head, CB_MODEL);
  const trf = matchText(head, CB_TRF);
  const reportNo = matchText(head, CB_REPORT_NO);
  const docType = readDocType(fileName);
  const equipmentName = matchText(head, CB_TEST_ITEM);
  const testingLab = matchText(head, CB_LAB);
  // 규격 번호가 줄바꿈에 걸려 "60601-\n1:2005"처럼 끊기는 경우가 있어 붙여 준다
  const appliedStandard = matchText(head, CB_STANDARD)?.replace(/-\s+(?=\d)/g, "-") ?? null;

  // "본 개정은 원본 성적서 No. REPxxxxx와 함께 사용한다"는 문장이나 개정 사유 설명은
  // 표지가 아니라 본문 뒷부분(개정 이력 설명 단락)에 나오는 경우가 많아 문서 전체에서 찾는다.
  // 줄바꿈으로 문장이 끊겨 있을 수 있어 공백을 정리한 뒤 찾는다.
  const flatFullText = fullText.replace(/\s+/g, " ");
  const originalRef = matchText(flatFullText, CB_ORIGINAL_REF);
  // 개정본은 원본 번호를 그대로 계보 축으로 쓰고, 원본 자신은 스스로가 축이 된다
  const chainAnchor = originalRef ?? reportNo;

  let revisionNo: string | null = null;
  let revisionDate: string | null = null;
  let foundIn: RevisionInfo["foundIn"] = "없음";

  const amendment = head.match(CB_AMENDMENT);
  if (amendment) {
    // "Amendment No. 3: 2026-05-08" — 개정본
    revisionNo = amendment[1];
    revisionDate = `${amendment[2]}-${amendment[3]}-${amendment[4]}`;
    foundIn = "본문";
  } else {
    const issued = head.match(CB_ISSUE_DATE);
    if (issued) {
      // 개정 표기가 없으면 최초 발행본으로 본다
      revisionNo = "0";
      revisionDate = `${issued[1]}-${issued[2]}-${issued[3]}`;
      foundIn = "본문";
    }
  }

  // 개정본은 본문에 적힌 "무엇이 바뀌었는지" 문장을 그대로 사유로 쓴다.
  // 원본(개정 0)은 그런 문장이 없으므로 "최초 발행"으로 표시한다.
  const reasonMatch = matchText(flatFullText, CB_REASON);
  const reasonForIssue = reasonMatch
    // 개정 사유는 바뀐 항목을 줄줄이 나열해 1,000자를 넘기도 한다.
    // 500자로 자르면 마지막 항목이 문장 중간에서 끊겨 사유가 누락된 것처럼 보인다.
    ? reasonMatch.slice(0, 3000)
    : revisionNo === "0"
      ? "최초 발행"
      : null;

  // 초안본은 발행 정보가 비어 있어 파일명에서 보조로 읽는다
  if (!revisionNo) {
    const fromName = fileName.match(FILE_AMENDMENT);
    if (fromName) {
      revisionNo = fromName[1];
      foundIn = "파일명";
    } else if (FILE_ORIGINAL.test(fileName)) {
      revisionNo = "0";
      foundIn = "파일명";
    }
  }
  if (!revisionDate) {
    const fromName = matchDateInFileName(fileName);
    if (fromName) {
      revisionDate = fromName;
      if (foundIn === "없음") foundIn = "파일명";
    }
  }

  const label = [trf, docType].filter(Boolean).join(" ");
  const title = model
    ? `${model}${label ? ` — ${label}` : ""}`
    : path.basename(fileName, path.extname(fileName));

  return {
    title,
    revisionNo,
    revisionDate,
    foundIn,
    model,
    standard: trf,
    reportNo,
    docType,
    chainAnchor,
    equipmentName,
    testingLab,
    appliedStandard,
    reasonForIssue,
  };
}

/**
 * 사내 자체 보고서의 머리말에서 문서번호·개정번호·발행일·제품명·개정사유를 읽는다.
 * 이 서식이 아니면 null을 돌려주고, 기존 국문 규정 해석을 그대로 쓰게 한다.
 */
function readInhouseFields(head: string, fileName: string) {
  if (!INHOUSE_MARKER.test(head) || !INHOUSE_DOC_NO.test(head)) return null;

  const revisionNo = matchFirst(head, INHOUSE_REVISION_PATTERNS);
  const history = head.match(INHOUSE_HISTORY);
  const historyText = history ? history[2].replace(/\s+/g, " ").trim().slice(0, 200) : null;

  return {
    reportNo: matchText(head, INHOUSE_DOC_NO),
    revisionNo,
    revisionDate: matchDate(head, INHOUSE_DATE_PATTERNS),
    model: readInhouseModel(head, fileName),
    // 외부 시험기관이 아니라 회사가 직접 작성한 문서다
    testingLab: "내부 보고서",
    reasonForIssue: historyText
      ? revisionNo === "0"
        ? `최초 발행(${historyText})`
        : historyText
      : revisionNo === "0"
        ? "최초 발행"
        : null,
  };
}

/** 머리말의 "POTENZA Page 1 / 11"이나 파일명 앞머리의 "[POTENZA]"에서 제품명을 읽는다 */
function readInhouseModel(head: string, fileName: string): string | null {
  const fromHead = head.match(INHOUSE_MODEL);
  const candidate = fromHead ? fromHead[1].trim() : null;
  // 쪽 번호 왼쪽에 제품명이 없는 서식에서는 "Date 2023.10.12" 같은 다른 머리말 항목이
  // 걸리므로, 날짜나 다른 항목 이름으로 시작하는 값은 제품명으로 보지 않는다.
  if (candidate && !/^[0-9]/.test(candidate) && !/^(?:Date|Rev|Page|Doc)\b/i.test(candidate)) {
    return candidate;
  }

  const fromFileName = fileName.match(INHOUSE_FILE_MODEL);
  return fromFileName ? fromFileName[1].trim() : null;
}

/** 국문 사내 규정에서 개정 정보를 읽는다 */
function readKoreanRegulation(head: string, fileName: string): RevisionInfo {
  const inhouse = readInhouseFields(head, fileName);
  let revisionNo = matchFirst(head, REVISION_NO_PATTERNS) ?? inhouse?.revisionNo ?? null;
  let revisionDate = matchDate(head, REVISION_DATE_PATTERNS) ?? inhouse?.revisionDate ?? null;
  let foundIn: RevisionInfo["foundIn"] = revisionNo || revisionDate ? "본문" : "없음";

  if (!revisionNo) {
    const fromName = matchFirst(fileName, REVISION_NO_PATTERNS);
    if (fromName) {
      revisionNo = fromName;
      if (foundIn === "없음") foundIn = "파일명";
    }
  }

  if (!revisionDate) {
    const fromName = matchDateInFileName(fileName);
    if (fromName) {
      revisionDate = fromName;
      if (foundIn === "없음") foundIn = "파일명";
    }
  }

  return {
    title: extractTitle(head, fileName),
    revisionNo,
    revisionDate,
    foundIn,
    model: inhouse?.model ?? null,
    // standard·docType은 비워 둔다. 값을 채우면 makeDocKey가 파일명 기준 묶음에서
    // 벗어나 같은 문서가 다른 키로 갈라진다.
    standard: null,
    reportNo: inhouse?.reportNo ?? null,
    docType: null,
    chainAnchor: null,
    equipmentName: null,
    testingLab: inhouse?.testingLab ?? null,
    appliedStandard: null,
    reasonForIssue: inhouse?.reasonForIssue ?? null,
  };
}

/**
 * 같은 문서의 다른 개정본인지 판단하는 키를 만든다.
 * 시험성적서는 개정할 때마다 파일명의 PRJ·REP 번호가 모두 바뀌므로
 * 파일명 대신 본문의 모델/규격을 기준으로 묶는다.
 */
export function makeDocKey(text: string, fileName: string): string {
  const info = extractRevisionInfo(text, fileName);

  // 가장 신뢰할 수 있는 근거: 개정본이 본문에 명시한 원본 성적서 번호.
  // 파일명의 PRJ·REP 번호는 개정마다 바뀌고, 표기된 모델명도 보고서마다 다를 수 있지만
  // (예: 같은 제품이 "POTENZA RF"·"POTENZA 1.5"로 다르게 적힘), 원본 성적서 번호는
  // 계보 전체에서 하나로 고정되어 있다.
  if (info.chainAnchor && info.docType) {
    return slug([info.docType, info.chainAnchor].join("_"));
  }

  // 계보를 못 찾았으면 제품명 기준으로 묶는다 (규격·문서종류가 함께 있을 때만)
  if (info.model && (info.standard || info.docType)) {
    return slug([info.model, info.standard, info.docType].filter(Boolean).join("_"));
  }

  return makeDocKeyFromFileName(fileName);
}

/** 본문에서 모델을 찾지 못했을 때 쓰는 파일명 기반 키 */
export function makeDocKeyFromFileName(fileName: string): string {
  const base = path.basename(fileName, path.extname(fileName));
  return (
    slug(
      base
        .replace(/[0-9]{4}[-._]?[0-9]{2}[-._]?[0-9]{2}/g, " ")
        .replace(/\(\s*Amd\.?\s*[0-9]*\s*\)/gi, " ")
        .replace(/\(\s*Original\s*\)/gi, " ")
        .replace(/(?:개정|rev|ver|version)\.?[-_\s]?[0-9]+(?:\.[0-9]+)?/gi, " ")
        .replace(/제?\s*[0-9]+\s*차/g, " ")
        .replace(/[-_\s]v[0-9]+(?:\.[0-9]+)?/gi, " "),
    ) || "문서"
  );
}

/** 챗봇이 문서를 찾을 때 쓸 별칭 (파일명에 들어 있는 제품명 등) */
export function makeAliases(fileName: string, model: string | null): string[] {
  const aliases = new Set<string>();
  const base = path.basename(fileName, path.extname(fileName));

  if (model) {
    for (const part of model.split(/[;,]/)) {
      const trimmed = part.trim();
      if (trimmed) aliases.add(trimmed);
    }
  }

  // 파일명에서 PRJ/REP 번호와 개정 표기를 걷어내고 남는 이름을 별칭으로 쓴다
  const cleaned = base
    .replace(/\b(?:PRJ|REP)[0-9]+\b/gi, " ")
    .replace(/\(\s*Amd\.?\s*[0-9]*\s*\)/gi, " ")
    .replace(/\(\s*Original\s*\)/gi, " ")
    .replace(/\b(?:Rev|rev)\.?[0-9]*\b/g, " ")
    .replace(/_+/g, " ")
    .trim();
  if (cleaned) aliases.add(cleaned);

  return [...aliases];
}

/** 이 문서가 시험성적서가 아니라 CB Test Certificate(인증서)인지 확인한다 */
export function isCbCertificate(text: string): boolean {
  return CB_CERT_MARKER.test(text.slice(0, 3000));
}

/** 인증서 본문에서 "이 인증서의 근거가 된 시험성적서 번호"를 찾는다 (예: REP035265, 407809) */
export function extractCertifiedReportNo(text: string): string | null {
  const match = text.match(CB_CERT_REPORT_REF);
  return match ? match[1].toUpperCase() : null;
}

/** 개정 정보가 이전 버전과 같은지 비교한다 */
export function isSameRevision(
  a: { revisionNo: string | null; revisionDate: string | null },
  b: { revisionNo: string | null; revisionDate: string | null },
): boolean {
  if (!a.revisionNo && !a.revisionDate) return false;
  return a.revisionNo === b.revisionNo && a.revisionDate === b.revisionDate;
}

function readDocType(fileName: string): string | null {
  if (/\bCBTR\b/i.test(fileName)) return "CBTR";
  if (/\bCBTC\b/i.test(fileName)) return "CBTC";
  return null;
}

/**
 * 문서 본문 첫 줄로 제목을 추정하는 방식은 인증서·표 위주 PDF에서 자주 어긋난다
 * (예: "T e s t R e p o rt"처럼 글자 사이가 벌어지거나, "Ref. Certif. No"·표 데이터
 * 한 줄이 뽑히는 경우). 이런 문서는 오히려 파일명이 더 설명적이므로, 본문에
 * "제목:"·"문서명:"이 명시된 경우가 아니면 파일명을 기본으로 쓴다.
 */
function extractTitle(head: string, fileName: string): string | null {
  const labeled = head.match(TITLE_PATTERN);
  if (labeled) return labeled[1].trim().slice(0, 80);

  const fromFileName = titleFromFileName(fileName);
  if (fromFileName) return fromFileName;

  return path.basename(fileName, path.extname(fileName)) || null;
}

function titleFromFileName(fileName: string): string | null {
  const base = path.basename(fileName, path.extname(fileName));
  const cleaned = base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function matchText(target: string, pattern: RegExp): string | null {
  const found = target.match(pattern);
  return found ? found[1].replace(/\s+/g, " ").trim() || null : null;
}

function matchFirst(target: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const found = target.match(pattern);
    if (found) return found[1];
  }
  return null;
}

function matchDate(target: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const found = target.match(pattern);
    if (found) return toIsoDate(found[1], found[2], found[3]);
  }
  return null;
}

function matchDateInFileName(fileName: string): string | null {
  // "241010_03" 같은 일련번호를 날짜로 오인하지 않도록 연도를 19xx·20xx로 제한한다
  const found = fileName.match(/((?:19|20)[0-9]{2})[-._]?([0-9]{2})[-._]?([0-9]{2})/);
  return found ? toIsoDate(found[1], found[2], found[3]) : null;
}

function toIsoDate(year: string, month: string, day: string): string | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function slug(text: string): string {
  return text
    .replace(/[^0-9A-Za-z가-힣]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
}
