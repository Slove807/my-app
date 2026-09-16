// 규제 변화 모니터링 시스템에서 공통으로 쓰는 타입 정의

/** 문서에서 뽑아낸 개정 정보 */
export type RevisionInfo = {
  title: string | null;
  revisionNo: string | null;
  revisionDate: string | null;
  /** 개정 정보를 어디에서 찾았는지 (근거 표시용) */
  foundIn: "본문" | "파일명" | "없음";
  /** 시험성적서의 Model/Type reference (모델명) */
  model: string | null;
  /** TRF No. (시험 양식 식별자) — 같은 제품이라도 시험 종류가 다르면 별개 문서로 구분하는 데 쓴다 */
  standard: string | null;
  /** 시험성적서의 Report Number (개정마다 바뀜, 성적서 번호) */
  reportNo: string | null;
  /** CBTR(시험성적서) / CBTC(인증서) 등 문서 종류 */
  docType: string | null;
  /** 같은 계보의 문서를 하나로 묶는 축. 개정본은 원본 성적서 번호, 원본은 자기 자신 */
  chainAnchor: string | null;
  /** Test item description (품목명) */
  equipmentName: string | null;
  /** Name of Testing Laboratory (시험기관) */
  testingLab: string | null;
  /** Standard 필드에 적힌 적용 규격 전체 표기 (예: IEC 60601-1:2005, .../AMD1:2012, .../AMD2:2020) */
  appliedStandard: string | null;
  /** 발행 및 개정사유 — 개정본은 본문의 "The updates concerned..." 문장, 원본은 "최초 발행" */
  reasonForIssue: string | null;
};

/** 변경 요약의 개별 항목 */
export type ChangeItem = {
  clause: string;
  summary: string;
  before: string;
  after: string;
};

/** 이전 버전 대비 변경 요약 */
export type ChangeSummary = {
  headline: string;
  items: ChangeItem[];
  addedCount: number;
  removedCount: number;
  /** ai: OpenAI 요약 성공 / rule: 규칙 기반 대체 요약 */
  generatedBy: "ai" | "rule";
  warning?: string;
  /** 이 요약이 정확히 어느 버전과 비교한 것인지 (화면에 명시하기 위함) */
  comparedWith: {
    version: number;
    revisionNo: string | null;
    revisionDate: string | null;
  };
  /** 본문에 적힌 발행 및 개정사유 (있으면 줄 단위 비교보다 우선하는 근거) */
  reasonForIssue: string | null;
  /**
   * 개정본이 전체 문서가 아니라 바뀐 부분만 담은 경우(길이 차이가 크게 나는 경우) 등
   * 줄 단위 비교를 그대로 믿기 어려운 상황일 때 붙이는 주의 문구
   */
  caveat?: string;
};

/** 보관된 문서의 한 버전 */
export type DocVersion = {
  version: number;
  originalName: string;
  /** 원본 파일을 읽어온 실제 경로 */
  sourcePath: string | null;
  storedFile: string;
  textFile: string;
  revisionNo: string | null;
  revisionDate: string | null;
  foundIn: RevisionInfo["foundIn"];
  /** revisionNo를 숫자로 바꾼 값. 폴더 탐색 순서와 무관하게 개정 순서를 정렬하는 데 쓴다 */
  revisionRank: number | null;
  reportNo: string | null;
  uploadedAt: string;
  charCount: number;
  /** 사용자가 답한 개인정보 포함 여부 */
  containsPersonalInfo: boolean;
  /** 첫 버전은 비교 대상이 없으므로 null */
  changeSummary: ChangeSummary | null;
  /** ★기본정보: 모델명 */
  model: string | null;
  /** ★기본정보: 품목명 */
  equipmentName: string | null;
  /** ★기본정보: 시험기관 */
  testingLab: string | null;
  /** ★기본정보: 적용 규격 */
  appliedStandard: string | null;
  /** 발행 및 개정사유. ★기본정보에는 표시하지 않는다(개정 이력이 있으면 변경 요약에 뜬다). 챗봇 근거·changeSummary 계산에는 계속 쓴다 */
  reasonForIssue: string | null;
  /** ★기본정보: 제품군 (스캔한 최상위 폴더명, 예: POTENZA) */
  productFamily: string | null;
  /** ★기본정보: 시험항목 (카테고리 이름 또는 적용 규격으로 판단한 시험 종류) */
  categoryLabel: string | null;
  /** ★기본정보: 상세 시험항목 (예: Biocompatibility의 Cytotoxicity·Sensitization 등 세부 시험명) */
  detailedTestItem: string | null;
  /** 계획서(Protocol/Plan)인지 보고서(Report)인지. 계획서는 시험항목 라벨의 "report"를 "Plan/Protocol"로 바꾼다 */
  docKind: "plan" | "report";
  /** ★기본정보: 작성 언어 (파일명에 국문/영문 표기가 있을 때만 채운다) */
  writtenLanguage: string | null;
  /** ★기본정보 일부를 담당자가 직접 입력했는지 (본문을 읽을 수 없는 스캔 문서) */
  manualEntry: boolean;
  /** 본문을 원문에서 그대로 읽지 못해 OCR로 알아본 글자인지 (오탈자가 섞일 수 있음) */
  ocrUsed: boolean;
  /** ★기본정보: 최신 규격 (구글 검색으로 확인한 최신판). 더 새 판이 없으면 적용 규격과 같다 */
  latestStandard: string | null;
  /** 최신 규격을 확인한 근거 주소 */
  latestStandardSource: string | null;
  /** 이 성적서에 귀속된 CB Test Certificate 원본 (있으면). 별도 문서로 다루지 않고 이 버전에 붙인다 */
  certificate: {
    originalName: string;
    sourcePath: string | null;
    storedFile: string;
  } | null;
  /** ★성적서 번호: 귀속된 CB Test Certificate 자신의 번호 (예: NO132524). 인증서가 없으면 null */
  certificateNo: string | null;
};

/** 같은 문서의 버전들을 묶은 단위 */
export type DocRecord = {
  key: string;
  title: string;
  /** 챗봇이 문서를 찾을 때 쓰는 별칭 (제품명, 파일명 등) */
  aliases: string[];
  versions: DocVersion[];
};

/** 파일 현황의 변화 한 건 */
export type InventoryChange = {
  kind: "added" | "removed" | "modified" | "renamed";
  path: string;
  ext: string;
  /** 이름이 바뀐 경우의 이전 경로 */
  from?: string;
};

/** 파일 현황 추적 결과 */
export type InventoryResult = {
  rootPath: string;
  totalFiles: number;
  byExtension: { ext: string; count: number }[];
  changes: InventoryChange[];
  changeCount: number;
  /** 처음 훑은 경우 비교 대상이 없다 */
  firstRun: boolean;
  previousTakenAt: string | null;
  takenAt: string;
};

/** 폴더 한 번 스캔한 결과 */
export type ScanSummary = {
  rootPath: string;
  /** 실제로 처리한 파일 결과 */
  results: ProcessResult[];
  /** 지난번과 내용이 같아 건너뛴 파일 수 */
  skippedCount: number;
  /** 폴더에서 찾은 지원 가능한 파일 수 */
  foundCount: number;
  /** 이번에 처리하지 못하고 남은 파일 수 (이어서 스캔하면 처리됨) */
  remaining: number;
  message: string;
};

/** 카테고리 한 건의 현재 보관 상태 (스캔 여러 번에 걸친 누적 결과를 반영한다) */
export type CategoryReport = {
  key: string;
  label: string;
  /** 이 카테고리 폴더에서 나온, 현재 보관 중인 문서들 */
  documents: DocRecord[];
  fileCount: number;
  /** no-folder: 대응하는 폴더를 아직 못 찾음(운송·포장 등) / folder-missing: 지정한 폴더가 실제로 없음 / ok: 정상 */
  status: "ok" | "no-folder" | "folder-missing";
};

/** 카테고리 스캔 결과 전체 */
export type CategoryScanSummary = {
  rootPath: string;
  categories: CategoryReport[];
  remaining: number;
  message: string;
};

/** 문서 처리 결과 */
export type ProcessResult = {
  status: "created" | "updated" | "unchanged" | "error";
  message: string;
  docKey?: string;
  title?: string;
  version?: number;
  revisionNo?: string | null;
  revisionDate?: string | null;
  changeSummary?: ChangeSummary | null;
  warnings: string[];
};
