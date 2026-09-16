import type { NextRequest } from "next/server";
import { CAN_SCAN_LOCAL_FOLDER } from "@/lib/config";
import { scanInventory } from "@/lib/inventory";
import { readSettings, saveSettings, validateRootPath } from "@/lib/settings";

/**
 * 폴더의 파일 현황(생성·삭제·수정·이름변경)을 확인한다.
 * 파일 목록과 크기·수정일만 읽으므로 온라인 전용 파일이 내려받아지지 않는다.
 */
export async function POST(request: NextRequest) {
  if (!CAN_SCAN_LOCAL_FOLDER) {
    return Response.json(
      {
        error:
          "이 서버(Vercel 배포)는 SharePoint 로컬 폴더에 접근할 수 없습니다. 관리자 PC에서 npm run dev로 실행한 뒤 확인해 주세요.",
      },
      { status: 400 },
    );
  }

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
