import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { readSettings, saveSettings, validateRootPath } from "@/lib/settings";

/** 저장된 최상위 폴더 경로를 돌려준다 (로그인한 모든 사용자) */
export async function GET() {
  return Response.json(await readSettings());
}

/** 최상위 폴더 경로를 저장한다 (관리자 전용) */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { rootPath?: string };
  const rootPath = body.rootPath?.trim();

  if (!rootPath) {
    return Response.json({ error: "폴더 경로를 입력해 주세요." }, { status: 400 });
  }

  const check = await validateRootPath(rootPath);
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: 400 });
  }

  await saveSettings({ rootPath });
  return Response.json({ rootPath });
}
