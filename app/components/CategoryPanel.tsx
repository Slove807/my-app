"use client";

import type { CategoryReport, CategoryScanSummary } from "@/lib/types";

const STATUS_LABEL: Record<CategoryReport["status"], string> = {
  ok: "확인됨",
  "no-folder": "해당 파일 없음",
  "folder-missing": "지정한 폴더를 찾지 못함",
};

const STATUS_STYLE: Record<CategoryReport["status"], string> = {
  ok: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "no-folder": "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  "folder-missing": "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

export default function CategoryPanel({ summary }: { summary: CategoryScanSummary }) {
  const found = summary.categories.filter((category) => category.status === "ok").length;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          카테고리별 확인 결과
        </h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {summary.categories.length}개 중 {found}개에서 문서 발견
        </span>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300">{summary.message}</p>

      <ul className="space-y-2">
        {summary.categories.map((category) => (
          <li
            key={category.key}
            className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {category.label}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[category.status]}`}
              >
                {STATUS_LABEL[category.status]}
                {category.status === "ok" ? ` · ${category.fileCount}건` : ""}
              </span>
            </div>

            {category.documents.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                {category.documents.map((document) => {
                  const latest = document.versions.at(-1);
                  return (
                    <li key={document.key}>
                      {document.title}
                      {latest && (
                        <span>
                          {" "}
                          (버전 {document.versions.length}개 · 개정 {latest.revisionNo ?? "없음"})
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
