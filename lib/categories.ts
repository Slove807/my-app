import path from "node:path";

/** 문서 카테고리 정의. `folders`는 제품 폴더(rootPath) 기준 상대경로다 */
export type DocCategory = {
  key: string;
  label: string;
  folders: string[];
};

/**
 * POTENZA 폴더 기준으로 확인한 12개 카테고리.
 * 운송·포장 밸리데이션은 현재 폴더에서 찾지 못해 비워 둔다 (화면에는 "해당 파일 없음"으로 표시).
 * 환경시험(IEC 60601-1-9)은 .doc 파일 1건뿐이라 이번 라운드에서는 제외한다 (PDF/TXT/MD만 지원).
 */
export const POTENZA_CATEGORIES: DocCategory[] = [
  {
    key: "safety",
    label: "Safety test report",
    folders: [
      "01. 미국FDA_특허회피팁(24.11)\\3. Safety 성적서",
      "02. 포텐자 LCD 추가건(25.05)\\Safety",
      "03. 포텐자 전원코드 추가건(26.04)\\SAFETY",
      "04. 포텐자 DC팬 추가건(26.05.08)",
    ],
  },
  {
    key: "emc",
    label: "EMC test report",
    folders: [
      "01. 미국FDA_특허회피팁(24.11)\\2.EMC성적서",
      "02. 포텐자 LCD 추가건(25.05)\\EMC\\24.11",
    ],
  },
  {
    key: "eo-gas",
    label: "Sterility, EO Residuals test report (EO가스 잔류량 시험)",
    folders: ["240214 EO가스 잔류량_CP-16, CP-25, CP-49, DDR, SFA, DIA"],
  },
  {
    key: "sterilization-validation",
    label: "EO Sterilization Validation Report (EO가스 멸균 공정 밸리데이션 보고서)",
    folders: [
      "Japan_POTENZA\\230622 Sterilization Process\\AC HP TIP Sterilization Validation",
      "Japan_POTENZA\\230622 Sterilization Process\\MOTOR & S HP TIP Sterilization Validation",
    ],
  },
  {
    key: "sterility-test",
    label: "Sterility, EO Residuals test report (EO가스 잔류량 시험)",
    folders: ["Sterility Test"],
  },
  {
    key: "user-cleaning-validation",
    label: "Cleaning Process Validation Report (사용자 세척 밸리데이션)",
    folders: ["260522 DDR TIP 사용자 세척 밸리데이션"],
  },
  {
    key: "biocompatibility",
    label: "Biocompatibility test report",
    folders: ["Biocompatibility Test Report"],
  },
  {
    key: "leachables",
    label: "Extractable test (용출물 시험)",
    folders: ["용출물 시험"],
  },
  {
    key: "transport-validation",
    label: "운송 밸리데이션",
    folders: [],
  },
  {
    key: "shelf-life",
    label: "Lifetime Analysis report / Shelf-Life report (유효기간 설정 관련 시험)",
    folders: ["Accelerated aging test"],
  },
  {
    key: "packaging-validation",
    label: "포장 밸리데이션",
    folders: [],
  },
  {
    key: "environmental",
    label: "환경 시험 (IEC 60601-1-9)",
    folders: [],
  },
];

/**
 * 본문의 적용 규격을 보고 판단하는 시험항목. 폴더로 묶는 카테고리 이름과 달리
 * "무슨 시험인지"를 나타내므로, 어느 폴더에서 나왔든 이 값을 먼저 쓴다.
 */
const TEST_LABEL_BY_STANDARD: { pattern: RegExp; label: string }[] = [
  { pattern: /60601-1-2\b/, label: "EMC test report" },
  { pattern: /60601-1-6\b/, label: "Usability test report" },
];

export function testLabelForStandard(appliedStandard: string | null): string | null {
  if (!appliedStandard) return null;
  return (
    TEST_LABEL_BY_STANDARD.find((entry) => entry.pattern.test(appliedStandard))?.label ?? null
  );
}

/**
 * Biocompatibility 성적서는 하나의 카테고리 안에 세포독성·감작성·자극성 등 서로 다른
 * 세부 시험이 섞여 있어, 파일명에 적힌 시험명을 보고 상세 시험항목을 구분한다.
 * (요청: "Biocompatibility test report의 경우 아래 내용을 구분해줘")
 * 가장 구체적인 패턴부터 확인해, 여러 단어가 겹치는 파일명에서도 올바른 항목을 고른다.
 */
const DETAILED_TEST_ITEM_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /hemolysis/i, label: "Hemolysis" },
  { pattern: /pyrogen/i, label: "Pyrogen" },
  { pattern: /cytotoxicity/i, label: "Cytotoxicity" },
  { pattern: /sensitization/i, label: "Sensitization" },
  { pattern: /intracutaneous|irritation|reactivity/i, label: "Irritation (Intracutaneous Reactivity)" },
  { pattern: /acute systemic toxicity/i, label: "Acute Systemic Toxicity" },
  { pattern: /ftir|infrared spectrosc?opy/i, label: "FTIR (적외선 분광)" },
];

export function detailedTestItem(categoryLabel: string | null, originalName: string): string | null {
  if (!categoryLabel || !/Biocompatibility/i.test(categoryLabel)) return null;
  return DETAILED_TEST_ITEM_PATTERNS.find((entry) => entry.pattern.test(originalName))?.label ?? null;
}

/**
 * 계획서(Protocol/Plan)인지 보고서(Report)인지를 파일명으로 구분한다.
 * (요청: "계획서/보고서를 구분해줘, 계획서는 report 대신 plan/protocol")
 * 명시적으로 계획서·Protocol이라고 적힌 경우만 계획서로 보고, 그 밖에는 보고서로 본다
 * (성적서·시험성적서처럼 "보고서"라는 단어가 없는 경우도 보고서로 취급).
 */
export function isPlanDocument(originalName: string): boolean {
  return /계획서|protocol/i.test(originalName);
}

/** 계획서로 판단되면 라벨의 "report"를 "Plan/Protocol"로 바꾼다 */
export function applyDocKindToLabel(label: string, isPlan: boolean): string {
  if (!isPlan) return label;
  return label.replace(/\breport\b/i, "Plan/Protocol");
}

/**
 * 파일명에 적힌 표기로 작성 언어를 구분한다. 표기가 없으면 임의로 추측하지 않고 null을 돌려준다.
 * (요청: "보고서: 작성 언어 표시 추가해줘")
 */
const LANGUAGE_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\(\s*K\s*,\s*E\s*\)/i, label: "국문·영문" },
  { pattern: /국문/, label: "국문" },
  { pattern: /영문/, label: "영문" },
  { pattern: /\(\s*K\s*\)/i, label: "국문" },
  { pattern: /\(\s*E\s*\)|_E(?=[._]|$)/i, label: "영문" },
];

export function writtenLanguage(originalName: string): string | null {
  return LANGUAGE_PATTERNS.find((entry) => entry.pattern.test(originalName))?.label ?? null;
}

/** rootPath 기준 카테고리 폴더의 전체 경로 목록을 돌려준다 */
export function categoryFolderPaths(
  rootPath: string,
  categories: DocCategory[],
): { category: DocCategory; folder: string }[] {
  const pairs: { category: DocCategory; folder: string }[] = [];
  for (const category of categories) {
    for (const folder of category.folders) {
      pairs.push({ category, folder: path.join(rootPath, folder) });
    }
  }
  return pairs;
}

/** 파일 경로가 어느 카테고리에 속하는지 찾는다 */
export function categorize(
  rootPath: string,
  filePath: string,
  categories: DocCategory[],
): DocCategory | null {
  const relative = path.relative(rootPath, filePath);
  for (const category of categories) {
    for (const folder of category.folders) {
      const normalizedFolder = folder.replace(/\\/g, path.sep) + path.sep;
      if ((relative + path.sep).startsWith(normalizedFolder)) return category;
    }
  }
  return null;
}
