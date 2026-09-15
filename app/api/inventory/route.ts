import type { NextRequest } from "next/server";
import { scanInventory } from "@/lib/inventory";
import { readSettings, saveSettings, validateRootPath } from "@/lib/settings";

/**
 * 폴더의 파일 현황(생성·삭제·수정·이름변경)을 확인한다.
 * 파일 목록과 크기·수정일만 읽으므로 온라인 전용 파일이 내려받아지지 않는다.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { rootPath?: string };

  const settings = await readSettings();
  const rootPath = (body.rootPath ?? settings.rootPath).trim();

  const check = await validateRootPath(rootPath);
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: 400 });
  }

  if (rootPath !== settings.rootPath) {
    await saveSettings({ rootPath });
  }

  return Response.json(await scanInventory(rootPath));
}
