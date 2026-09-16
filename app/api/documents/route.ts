import type { NextRequest } from "next/server";
import { listDocuments, processIncoming } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import type { ProcessResult } from "@/lib/types";

// 여러 파일을 한 번에 첨부하면(OCR·구글 규격 조회 포함) 기본 제한 시간을 넘길 수 있어 늘려둔다
export const maxDuration = 60;

/** 보관 중인 문서 목록을 돌려준다 */
export async function GET() {
  const documents = await listDocuments();
  return Response.json({ documents });
}

type StagedFile = { path: string; originalName: string };

/**
 * 화면에서 첨부한 문서를 처리한다.
 * 파일 바이트는 Next.js API로 직접 보내지 않는다 — Vercel 서버리스 함수의 요청 본문 용량
 * 제한("Request Entity Too Large")에 걸리기 때문에, 브라우저가 Supabase Storage의
 * uploads 버킷(자기 user id 하위 경로)에 먼저 올려 두고 그 경로만 여기로 알려준다.
 * 여기서는 그 경로에서 파일을 내려받아 분석한 뒤, 처리 성공 여부와 무관하게 지운다.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    containsPersonalInfo?: "yes" | "no";
    files?: StagedFile[];
  } | null;

  const answer = body?.containsPersonalInfo;
  // PRD 7번: 개인정보 포함 여부를 먼저 확인하지 않으면 처리하지 않는다
  if (answer !== "yes" && answer !== "no") {
    return Response.json(
      { error: "문서에 개인정보가 포함되어 있는지 먼저 선택해 주세요." },
      { status: 400 },
    );
  }

  const files = body?.files ?? [];
  if (files.length === 0) {
    return Response.json({ error: "첨부한 파일이 없습니다." }, { status: 400 });
  }

  const supabase = await createClient();
  const results: ProcessResult[] = [];

  for (const file of files) {
    try {
      const { data, error } = await supabase.storage.from("uploads").download(file.path);
      if (error || !data) {
        results.push({
          status: "error",
          message: `'${file.originalName}' 파일을 불러오지 못했습니다: ${error?.message ?? "알 수 없는 오류"}`,
          warnings: [],
        });
        continue;
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      results.push(
        await processIncoming({
          buffer,
          originalName: file.originalName,
          containsPersonalInfo: answer === "yes",
        }),
      );
    } finally {
      // 임시 업로드 파일이라 처리 성공·실패와 무관하게 정리한다
      await supabase.storage.from("uploads").remove([file.path]);
    }
  }

  return Response.json({ results });
}
