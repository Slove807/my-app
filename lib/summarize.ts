import OpenAI from "openai";
import { OPENAI_MODEL } from "./config";
import {
  formatComparisonForPrompt,
  prioritizeItems,
  type TextComparison,
} from "./compare";
import type { ChangeItem, ChangeSummary } from "./types";

// PRD Must 2 규칙을 프롬프트로 고정한다.
// 1) 근거가 된 문서명·조항을 함께 표시한다
// 2) 원문에서 확인되지 않는 내용은 답변에 포함하지 않는다
// 3) 법률적 해석이나 자문은 하지 않는다 (사실 요약만, 판단은 담당자 몫)
const COMMON_RULES = `너는 의료기기 인허가 담당자를 돕는 규정 변경 요약 도우미다. 다음 규칙을 반드시 지켜라.
- 제공된 원문에 실제로 있는 내용만 사용한다. 추측하거나 일반 지식으로 보충하지 않는다.
- 모든 항목에 근거가 된 문서명과 조항을 함께 표시한다. 조항을 알 수 없으면 "조항 미상"이라고 적는다.
- 규정에 대한 법률적 해석이나 자문은 하지 않는다. 무엇이 바뀌었는지 사실만 전달한다.
- 원문에서 확인할 수 없으면 "제공된 문서에서 확인되지 않습니다"라고 답한다.
- 모든 답변은 한국어로 작성한다.`;

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** 두 버전의 차이를 AI로 요약한다. 실패하면 규칙 기반 요약으로 대체한다 */
export async function summarizeChange(params: {
  documentTitle: string;
  previousLabel: string;
  currentLabel: string;
  comparison: TextComparison;
  comparedWith: ChangeSummary["comparedWith"];
  /** 본문에 적힌 발행/개정사유. 있으면 줄 단위 비교보다 이 문장을 우선한다 */
  reasonForIssue: string | null;
  /** 전체 재비교가 어려운 상황(개정본이 변경분만 다루는 등)일 때 붙일 주의 문구 */
  caveat?: string;
}): Promise<ChangeSummary> {
  const {
    documentTitle,
    previousLabel,
    currentLabel,
    comparison,
    comparedWith,
    reasonForIssue,
    caveat,
  } = params;
  const fallback = buildRuleSummary(comparison, comparedWith, reasonForIssue, caveat);
  const client = getClient();

  if (!client) {
    return {
      ...fallback,
      warning:
        "OPENAI_API_KEY가 없어 AI 요약 없이 변경된 줄만 그대로 보여줍니다.",
    };
  }

  try {
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: COMMON_RULES },
        {
          role: "user",
          content: `문서명: ${documentTitle}
이전 버전: ${previousLabel}
새 버전: ${currentLabel}
${reasonForIssue ? `\n문서에 직접 적힌 발행/개정사유(가장 신뢰할 수 있는 근거): ${reasonForIssue}\n` : ""}
아래는 두 버전을 줄 단위로 비교한 결과다. 개정본은 전체 문서가 아니라 바뀐 부분만 담고 있을 수 있으니,
위 발행/개정사유가 있다면 그 내용을 headline에 우선 반영하고, 아래 비교 결과는 보조 근거로만 사용하라.

${formatComparisonForPrompt(comparison)}

이 변경 내용을 JSON으로만 답하라. 형식:
{"headline": "한 문장 요약(발행/개정사유가 있으면 그 내용을 기반으로 작성)", "items": [{"clause": "제5조", "summary": "무엇이 바뀌었는지 한 문장", "before": "이전 문구(없으면 빈 문자열)", "after": "바뀐 문구(없으면 빈 문자열)"}]}
items는 중요한 변경부터 최대 8개까지만 담는다.`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("응답이 비어 있습니다.");

    const parsed = JSON.parse(content) as {
      headline?: string;
      items?: ChangeItem[];
    };

    return {
      headline: parsed.headline?.trim() || fallback.headline,
      items: normalizeItems(parsed.items),
      addedCount: comparison.addedCount,
      removedCount: comparison.removedCount,
      generatedBy: "ai",
      comparedWith,
      reasonForIssue,
      caveat,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ...fallback,
      warning: `AI 요약에 실패해 변경된 줄만 그대로 보여줍니다. (사유: ${reason})`,
    };
  }
}

/** 보관된 문서 내용을 근거로 질문에 답한다 */
export async function answerQuestion(
  question: string,
  context: string,
): Promise<{ answer: string; generatedBy: "ai" | "rule" }> {
  const client = getClient();

  if (!client) {
    return {
      answer:
        "OPENAI_API_KEY가 설정되어 있지 않아 챗봇 답변을 만들 수 없습니다. my-app/.env 파일에 키를 넣고 개발 서버를 다시 시작해 주세요.",
      generatedBy: "rule",
    };
  }

  if (!context.trim()) {
    return {
      answer:
        "아직 보관된 문서가 없습니다. 먼저 문서를 첨부하면 변경 내용을 기준으로 답변해 드립니다.",
      generatedBy: "rule",
    };
  }

  try {
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: COMMON_RULES },
        {
          role: "user",
          content: `아래는 현재 보관 중인 문서와 변경 요약이다.

${context}

위 내용만 근거로 다음 질문에 답하라. 답변 끝에 "근거: 문서명, 조항" 형식으로 근거를 밝혀라.

질문: ${question}`,
        },
      ],
    });

    const answer = response.choices[0]?.message?.content?.trim();
    if (!answer) throw new Error("응답이 비어 있습니다.");
    return { answer, generatedBy: "ai" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      answer: `AI 답변 생성에 실패했습니다. (사유: ${reason})`,
      generatedBy: "rule",
    };
  }
}

/** AI를 쓰지 못할 때 변경된 줄을 그대로 보여주는 대체 요약 */
function buildRuleSummary(
  comparison: TextComparison,
  comparedWith: ChangeSummary["comparedWith"],
  reasonForIssue: string | null,
  caveat?: string,
): ChangeSummary {
  const ordered = prioritizeItems(comparison.items).slice(0, 8);

  const items: ChangeItem[] = ordered.map((item) => ({
    clause: item.clause,
    summary:
      item.kind === "changed"
        ? "문구가 바뀌었습니다."
        : item.kind === "added"
          ? "내용이 추가되었습니다."
          : "내용이 삭제되었습니다.",
    before: item.before,
    after: item.after,
  }));

  return {
    // 본문에 개정사유가 적혀 있으면 그걸 headline으로 쓴다 — 줄 수 집계보다 훨씬 신뢰할 수 있는 근거다
    headline:
      reasonForIssue ??
      `추가 ${comparison.addedCount}줄, 삭제 ${comparison.removedCount}줄이 확인되었습니다.`,
    items,
    addedCount: comparison.addedCount,
    removedCount: comparison.removedCount,
    generatedBy: "rule",
    comparedWith,
    reasonForIssue,
    caveat,
  };
}

function normalizeItems(items: ChangeItem[] | undefined): ChangeItem[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 8).map((item) => ({
    clause: String(item?.clause ?? "조항 미상"),
    summary: String(item?.summary ?? ""),
    before: String(item?.before ?? ""),
    after: String(item?.after ?? ""),
  }));
}
