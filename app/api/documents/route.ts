import type { NextRequest } from "next/server";
import { listDocuments, processIncoming } from "@/lib/store";
import type { ProcessResult } from "@/lib/types";

/** 보관 중인 문서 목록을 돌려준다 */
export async function GET() {
  const documents = await listDocuments();
  return Response.json({ documents });
}

/** 화면에서 첨부한 문서를 처리한다 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const answer = formData.get("containsPersonalInfo");

  // PRD 7번: 개인정보 포함 여부를 먼저 확인하지 않으면 처리하지 않는다
  if (answer !== "yes" && answer !== "no") {
    return Response.json(
      { error: "문서에 개인정보가 포함되어 있는지 먼저 선택해 주세요." },
      { status: 400 },
    );
  }

  const files = formData.getAll("files").filter((item): item is File => item instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "첨부한 파일이 없습니다." }, { status: 400 });
  }

  const results: ProcessResult[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    results.push(
      await processIncoming({
        buffer,
        originalName: file.name,
        containsPersonalInfo: answer === "yes",
      }),
    );
  }

  return Response.json({ results });
}
