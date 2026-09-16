"use client";

import { useState } from "react";

type Message = {
  role: "user" | "assistant";
  text: string;
  /** 답변의 근거가 된 문서 */
  matchedTitle?: string;
};

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    // 최신 질문 1건에 대한 답만 보여준다 — 이전 질문·답은 새 질문을 보내는 순간 지운다
    setMessages([{ role: "user", text: trimmed }]);
    setQuestion("");
    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await response.json();
      const text = response.ok ? data.answer : (data.error ?? "답변에 실패했습니다.");
      setMessages([
        { role: "user", text: trimmed },
        { role: "assistant", text, matchedTitle: data.matchedTitle },
      ]);
    } catch (caught) {
      setMessages([
        { role: "user", text: trimmed },
        { role: "assistant", text: `요청에 실패했습니다: ${String(caught)}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        2. 문서 내용 질문하기
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        보관된 문서의 ★기본정보와 변경 이력만 근거로 답합니다. 원문에서 확인되지 않는 내용은
        답하지 않습니다.
      </p>

      <div className="mt-4 min-h-40 space-y-3">
        {messages.length === 0 && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            예시: &quot;OP manual의 시험기관이 어디야?&quot; · &quot;OP manual의 최신 버전에서
            변경사항을 알려줘&quot;
          </p>
        )}

        {messages.map((message, index) =>
          message.role === "user" ? (
            <div
              key={index}
              className="ml-auto max-w-[85%] rounded-lg bg-slate-900 px-3 py-2 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
            >
              {message.text}
            </div>
          ) : (
            <div
              key={index}
              className="max-w-[95%] rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800"
            >
              {message.matchedTitle && (
                <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                  근거 문서: {message.matchedTitle}
                </p>
              )}
              <p className="text-sm whitespace-pre-wrap text-slate-800 dark:text-slate-100">
                {message.text}
              </p>
            </div>
          ),
        )}

        {busy && (
          <p className="text-sm text-slate-500 dark:text-slate-400">답변을 만드는 중...</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="질문을 입력하세요"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          보내기
        </button>
      </form>
    </section>
  );
}
