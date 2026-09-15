"use client";

import { useRef, useState } from "react";
import type { ProcessResult } from "@/lib/types";

type Props = {
  onProcessed: (results: ProcessResult[], notice?: string) => void;
};

export default function UploadPanel({ onProcessed }: Props) {
  const [personalInfo, setPersonalInfo] = useState<"yes" | "no" | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const files = inputRef.current?.files;
    if (!personalInfo) {
      setError("개인정보 포함 여부를 먼저 선택해 주세요.");
      return;
    }
    if (!files || files.length === 0) {
      setError("첨부할 파일을 선택해 주세요.");
      return;
    }

    setBusy(true);
    setError(null);

    const formData = new FormData();
    formData.set("containsPersonalInfo", personalInfo);
    for (const file of Array.from(files)) formData.append("files", file);

    try {
      const response = await fetch("/api/documents", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "처리에 실패했습니다.");
      onProcessed(data.results);
      if (inputRef.current) inputRef.current.value = "";
      setFileNames([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        직접 파일 첨부
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        폴더에 없는 문서를 하나씩 확인하고 싶을 때 사용합니다. (PDF, TXT, MD)
      </p>

      <div className="mt-4">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          이 문서에 개인정보가 포함되어 있나요?
        </p>
        <div className="mt-2 flex gap-2">
          {(["no", "yes"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPersonalInfo(value)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                personalInfo === value
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {value === "no" ? "아니요" : "예, 포함되어 있습니다"}
            </button>
          ))}
        </div>
        {personalInfo === "yes" && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            경고: 개인정보가 포함된 문서입니다. 요약 결과를 외부에 공유하지 않도록 주의하세요. (그대로 진행됩니다)
          </p>
        )}
      </div>

      <div className="mt-4">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.hwp,.hwpx"
          onChange={(event) =>
            setFileNames(Array.from(event.target.files ?? []).map((file) => file.name))
          }
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
        />
        {fileNames.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
            {fileNames.map((name) => (
              <li key={name}>• {name}</li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={handleUpload}
        disabled={busy}
        className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
      >
        {busy ? "분석 중..." : "첨부하고 변경 내용 확인"}
      </button>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
    </section>
  );
}
