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
    label: "IEC 기반 Safety 성적서",
    folders: [
      "01. 미국FDA_특허회피팁(24.11)\\3. Safety 성적서",
      "02. 포텐자 LCD 추가건(25.05)\\Safety",
      "03. 포텐자 전원코드 추가건(26.04)\\SAFETY",
      "04. 포텐자 DC팬 추가건(26.05.08)",
    ],
  },
  {
    key: "emc",
    label: "IEC 기반 EMC 성적서",
    folders: [
      "01. 미국FDA_특허회피팁(24.11)\\2.EMC성적서",
      "02. 포텐자 LCD 추가건(25.05)\\EMC\\24.11",
    ],
  },
  {
    key: "eo-gas",
    label: "EO가스 잔류량 시험",
    folders: ["240214 EO가스 잔류량_CP-16, CP-25, CP-49, DDR, SFA, DIA"],
  },
  {
    key: "sterilization-validation",
    label: "멸균 밸리데이션 성적서",
    folders: [
      "Japan_POTENZA\\230622 Sterilization Process\\AC HP TIP Sterilization Validation",
      "Japan_POTENZA\\230622 Sterilization Process\\MOTOR & S HP TIP Sterilization Validation",
    ],
  },
  {
    key: "sterility-test",
    label: "무균 시험",
    folders: ["Sterility Test"],
  },
  {
    key: "user-cleaning-validation",
    label: "사용자 세척 밸리데이션",
    folders: ["260522 DDR TIP 사용자 세척 밸리데이션"],
  },
  {
    key: "biocompatibility",
    label: "Biocompatibility 성적서",
    folders: ["Biocompatibility Test Report"],
  },
  {
    key: "leachables",
    label: "용출물 시험",
    folders: ["용출물 시험"],
  },
  {
    key: "transport-validation",
    label: "운송 밸리데이션",
    folders: [],
  },
  {
    key: "shelf-life",
    label: "유효기간 설정 시험",
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
 * IEC 60601-1-2(EMC 협력 표준)를 적용 규격으로 쓰는 문서는 어느 폴더에서 나왔든
 * 시험항목을 "EMC test"로 표시한다. 폴더로 묶는 카테고리 이름과 달리, 이 값은
 * 본문의 적용 규격을 보고 판단한 "무슨 시험인지"를 나타낸다.
 */
export const EMC_TEST_LABEL = "EMC test";

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
