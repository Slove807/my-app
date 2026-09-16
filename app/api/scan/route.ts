import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { CAN_SCAN_LOCAL_FOLDER } from "@/lib/config";
import { readSettings, saveSettings, validateRootPath } from "@/lib/settings";
import { scanFolder } from "@/lib/store";

/** 지정한 최상위 폴더와 하위 폴더의 문서를 한꺼번에 확인한다 (관리자 전용 — 비용·부하 발생) */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  if (!CAN_SCAN_LOCAL_FOLDER) {
    return Response.json(
      {
        error:
          "이 서버(Vercel 배포)는 SharePoint 로컬 폴더에 접근할 수 없습니다. 관리자 PC에서 npm run dev로 실행한 뒤 스캔해 주세요.",
      },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    rootPath?: string;
    containsPersonalInfo?: boolean;
    force?: boolean;
  };

  // PRD 7번: 개인정보 포함 여부를 먼저 확인하지 않으면 처리하지 않는다
  if (typeof body.containsPersonalInfo !== "boolean") {
    return Response.json(
      { error: "문서에 개인정보가 포함되어 있는지 먼저 선택해 주세요." },
      { status: 400 },
    );
  }

  const settings = await readSettings();
  const rootPath = (body.rootPath ?? settings.rootPath).trim();

  const check = await validateRootPath(rootPath);
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: 400 });
  }

  // 확인된 경로는 다음 실행에서도 쓰도록 저장해 둔다
  if (rootPath !== settings.rootPath) {
    await saveSettings({ rootPath });
  }

  const summary = await scanFolder({
    rootPath,
    containsPersonalInfo: body.containsPersonalInfo,
    force: body.force === true,
  });

  return Response.json(summary);
}
