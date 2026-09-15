import path from "node:path";

/** POC 단계에서는 프로젝트 안의 로컬 디렉토리를 문서 저장소로 사용한다 (PRD 8번 항목) */
export const DATA_ROOT = path.join(process.cwd(), "data");

/** 최상위 폴더를 따로 지정하지 않았을 때 쓰는 기본 폴더 */
export const DEFAULT_ROOT_DIR = path.join(DATA_ROOT, "inbox");

/** 버전별로 문서를 보관하는 디렉토리 */
export const ARCHIVE_DIR = path.join(DATA_ROOT, "archive");

/** 사용자가 지정한 최상위 폴더 경로를 저장하는 파일 */
export const SETTINGS_FILE = path.join(DATA_ROOT, "settings.json");

/** 이미 검사한 파일을 건너뛰기 위한 기록 */
export const SCAN_CACHE_FILE = path.join(DATA_ROOT, "scan-cache.json");

/** 파일 현황(생성·삭제·수정·이름변경) 추적 기록 */
export const INVENTORY_FILE = path.join(DATA_ROOT, "inventory.json");

/**
 * 본문을 읽을 수 없는 스캔 문서의 ★기본정보를 담당자가 직접 적어 두는 파일.
 * 파일명을 키로 쓰고, 적어 둔 값은 본문에서 읽은 값보다 우선한다.
 */
export const MANUAL_META_FILE = path.join(DATA_ROOT, "manual-meta.json");

/** 현황 추적에서 따라 내려갈 최대 깊이 */
export const MAX_INVENTORY_DEPTH = 12;

/** 화면에 한 번에 보여줄 최대 변화 건수 */
export const MAX_INVENTORY_CHANGES = 200;

/** 텍스트 추출을 지원하는 확장자 */
export const SUPPORTED_EXTENSIONS = [".pdf", ".txt", ".md"] as const;

/** 확장자는 알지만 이번 POC에서 텍스트 추출을 지원하지 않는 형식 */
export const DEFERRED_EXTENSIONS = [".hwp", ".hwpx"] as const;

/** 한 번 스캔할 때 훑을 최대 파일 수 */
export const MAX_SCAN_FILES = 300;

/** 한 번의 요청에서 본문을 읽을 파일 수 (나머지는 이어서 처리) */
export const SCAN_BATCH_SIZE = 25;

/**
 * Windows 기본 경로 길이 한도.
 * 이 길이를 넘으면 OneDrive가 온라인 전용 파일을 내려받지 못해 본문을 읽을 수 없다.
 */
export const MAX_WINDOWS_PATH = 260;

/** 하위 폴더를 따라 내려갈 최대 깊이 (실제 문서함이 7단계까지 내려간다) */
export const MAX_SCAN_DEPTH = 12;

/** 처리할 파일 하나의 최대 크기. EMC 성적서가 60MB에 이르러 넉넉히 잡는다 */
export const MAX_FILE_BYTES = 120 * 1024 * 1024;

/** 챗봇 컨텍스트에 넣을 문서당 최대 글자 수 */
export const CHAT_CONTEXT_CHARS = 6000;

/** 요약에 사용할 OpenAI 모델 */
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

/**
 * 시험성적서가 아니라 부속 자료(IFU·장비명판·라벨·멸균지 등)인 파일은 스캔 대상에서 제외한다.
 * (요청: IFU 제외, 장비명판 제외, 라벨 제외, 멸균지 제외)
 */
const EXCLUDED_FILENAME_PATTERNS = [
  /\bIFU\b/i,
  /장비\s*명판/,
  /라벨/,
  /멸균지/,
  // IEC 60601-1 계열 성적서의 부속 문서(국가별 추가 요구사항)라 따로 다루지 않는다
  /National\s*deviation/i,
];

/**
 * 라벨 도안처럼 파일명만으로는 부속 자료인지 알 수 없고 상위 폴더로만 구분되는 파일이 있다
 * (예: "1.IFU > 2.IFU(Cynosure) > 라벨" 폴더 안의 핸드피스·NE pad 라벨 도안 PDF).
 * 이런 폴더는 통째로 건너뛴다.
 */
const EXCLUDED_FOLDER_PATTERNS = [/\bIFU\b/i, /라벨/];

export function isExcludedFromScan(fileName: string): boolean {
  return EXCLUDED_FILENAME_PATTERNS.some((pattern) => pattern.test(fileName));
}

export function isExcludedFolder(folderName: string): boolean {
  return EXCLUDED_FOLDER_PATTERNS.some((pattern) => pattern.test(folderName));
}

/**
 * CB Test Certificate 파일명 패턴. 이런 파일은 스캔 순서를 맨 뒤로 미뤄, 짝이 되는
 * CB Report(시험성적서)가 먼저 보관된 뒤에 처리되게 한다 (본문 기준 매칭이 가능해짐).
 */
export const CB_CERTIFICATE_FILENAME_PATTERN = /CB[\s_-]*certificate/i;
