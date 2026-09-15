"use client";

import type { InventoryChange, InventoryResult } from "@/lib/types";

const KIND_LABEL: Record<InventoryChange["kind"], string> = {
  added: "새로 생김",
  modified: "수정됨",
  renamed: "이름 바뀜",
  removed: "삭제됨",
};

const KIND_STYLE: Record<InventoryChange["kind"], string> = {
  added: "bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  modified: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  renamed: "bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  removed: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export default function InventoryPanel({ result }: { result: InventoryResult }) {
  const counts = (["added", "modified", "renamed", "removed"] as const).map((kind) => ({
    kind,
    count: result.changes.filter((change) => change.kind === kind).length,
  }));

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          파일 현황
        </h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          총 {result.totalFiles.toLocaleString()}개
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {result.byExtension.slice(0, 8).map((entry) => (
          <span
            key={entry.ext}
            className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            {entry.ext} {entry.count.toLocaleString()}
          </span>
        ))}
      </div>

      {result.firstRun ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          기준 목록을 만들었습니다. 다음에 다시 확인하면 그 사이에 생기거나 바뀐 파일을 알려드립니다.
        </p>
      ) : result.changeCount === 0 ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          지난번 확인 이후 바뀐 파일이 없습니다.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {counts
              .filter((entry) => entry.count > 0)
              .map((entry) => (
                <span
                  key={entry.kind}
                  className={`rounded px-2 py-0.5 text-xs font-medium ${KIND_STYLE[entry.kind]}`}
                >
                  {KIND_LABEL[entry.kind]} {entry.count}
                </span>
              ))}
          </div>

          <ul className="max-h-96 space-y-1.5 overflow-y-auto">
            {result.changes.map((change, index) => (
              <li
                key={`${change.kind}-${change.path}-${index}`}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"
              >
                <span
                  className={`mr-2 rounded px-1.5 py-0.5 font-medium ${KIND_STYLE[change.kind]}`}
                >
                  {KIND_LABEL[change.kind]}
                </span>
                <span className="font-mono break-all text-slate-700 dark:text-slate-200">
                  {change.path}
                </span>
                {change.from && (
                  <p className="mt-1 font-mono break-all text-slate-500 dark:text-slate-400">
                    이전: {change.from}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {result.changeCount > result.changes.length && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              변화가 많아 {result.changes.length}건만 표시했습니다. (전체{" "}
              {result.changeCount.toLocaleString()}건)
            </p>
          )}
        </>
      )}
    </section>
  );
}
