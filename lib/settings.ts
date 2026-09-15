import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { DATA_ROOT, DEFAULT_ROOT_DIR, SETTINGS_FILE } from "./config";

export type Settings = {
  /** 담당자가 지정한 최상위 문서 폴더 */
  rootPath: string;
};

export async function readSettings(): Promise<Settings> {
  try {
    const raw = await readFile(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { rootPath: parsed.rootPath || DEFAULT_ROOT_DIR };
  } catch {
    return { rootPath: DEFAULT_ROOT_DIR };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await mkdir(DATA_ROOT, { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
}

/** 지정한 경로가 실제로 존재하는 폴더인지 확인한다 */
export async function validateRootPath(
  rootPath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = rootPath.trim();
  if (!trimmed) return { ok: false, error: "폴더 경로를 입력해 주세요." };

  try {
    const info = await stat(trimmed);
    if (!info.isDirectory()) {
      return { ok: false, error: "파일이 아니라 폴더 경로를 입력해 주세요." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: `폴더를 찾을 수 없습니다: ${trimmed}` };
  }
}
