import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { POTENZA_CATEGORIES } from "@/lib/categories";
import { CAN_SCAN_LOCAL_FOLDER } from "@/lib/config";
import { readSettings, saveSettings, validateRootPath } from "@/lib/settings";
import { scanCategories } from "@/lib/store";

/**
 * 지정한 제품 폴더에서 정해진 12개 카테고리(Safety, EMC, 멸균 밸리데이션 등)에
 * 해당하는 폴더만 훑는다 (관리자 전용 — 비용·부하 발생). 운송·포장처럼 대응 폴더가
 * 없는 카테고리는 "해당 파일 없음"으로 그대로 보고한다.
 */
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

  if (rootPath !== settings.rootPath) {
    await saveSettings({ rootPath });
  }

  // POC 범위: 지금은 POTENZA 카테고리 목록 하나만 지원한다.
  const summary = await scanCategories({
    rootPath,
    categories: POTENZA_CATEGORIES,
    containsPersonalInfo: body.containsPersonalInfo,
    force: body.force === true,
  });

  return Response.json(summary);
}
