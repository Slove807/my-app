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
