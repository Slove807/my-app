import type { NextRequest } from "next/server";
import { answerFromRecord, findDocument } from "@/lib/lookup";
import { buildFocusedContext, listDocuments } from "@/lib/store";
import { answerQuestion, hasOpenAIKey } from "@/lib/summarize";

/** 질문이 지목한 문서 한 건을 근거로 답한다 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { question?: string };
  const question = body.question?.trim();

  if (!question) {
    return Response.json({ error: "질문을 입력해 주세요." }, { status: 400 });
  }

  const records = await listDocuments();
  if (records.length === 0) {
    return Response.json({
      answer:
        "아직 보관된 문서가 없습니다. 먼저 문서 폴더를 스캔하거나 파일을 첨부해 주세요.",
      generatedBy: "rule",
    });
  }

  const lookup = findDocument(records, question);

  if (lookup.kind === "none") {
    const names = records.map((record) => `- ${record.title}`).join("\n");
    return Response.json({
      answer: `어느 문서를 말씀하시는지 찾지 못했습니다. 보관 중인 문서는 다음과 같습니다.\n\n${names}\n\n문서명을 함께 적어 다시 질문해 주세요.`,
      generatedBy: "rule",
    });
  }

  if (lookup.kind === "ambiguous") {
    const names = lookup.candidates.map((record) => `- ${record.title}`).join("\n");
    return Response.json({
      answer: `이름이 비슷한 문서가 여러 건입니다. 어느 문서인지 알려주세요.\n\n${names}`,
      generatedBy: "rule",
    });
  }

  const { record } = lookup;

  // 외부 전송이 막혀 있으면 질문 표현을 보고 ★기본정보·변경 이력 중 맞는 답을 찾아 정리한다
  if (!hasOpenAIKey()) {
    return Response.json({
      answer: answerFromRecord(record, question),
      generatedBy: "rule",
      matchedTitle: record.title,
    });
  }

  const context = await buildFocusedContext(record);
  const result = await answerQuestion(question, context);

  return Response.json({ ...result, matchedTitle: record.title });
}
