"use client";

import { useCallback, useEffect, useState } from "react";
import CategoryPanel from "./CategoryPanel";
import ChatPanel from "./ChatPanel";
import DocumentList from "./DocumentList";
import FolderPanel from "./FolderPanel";
import InventoryPanel from "./InventoryPanel";
import UploadPanel from "./UploadPanel";
import type {
  CategoryScanSummary,
  DocRecord,
  InventoryResult,
  ProcessResult,
  ScanSummary,
  SourceFilter,
} from "@/lib/types";
import type { Role } from "@/lib/auth";

const STATUS_LABEL: Record<ProcessResult["status"], string> = {
  created: "신규 보관",
  updated: "변경 감지",
  unchanged: "변경 없음",
  error: "처리 실패",
};

const STATUS_STYLE: Record<ProcessResult["status"], string> = {
  created: "bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  updated: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  unchanged: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  error: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export default function Dashboard({
  role,
  canScanLocally,
}: {
  role: Role;
  canScanLocally: boolean;
}) {
  const [documents, setDocuments] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<ProcessResult[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryResult | null>(null);
  const [categorySummary, setCategorySummary] = useState<CategoryScanSummary | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/documents");
      const data = await response.json();
      setDocuments(data.documents ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function show(processed: ProcessResult[], message?: string) {
    setResults(processed);
    setNotice(message ?? null);
    refresh();
  }

  // 변경이 있었던 결과를 위로 올려 눈에 먼저 들어오게 한다
  const sortedResults = [...results].sort(
    (a, b) => rank(a.status) - rank(b.status),
  );

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <div className="space-y-6">
        <FolderPanel
          role={role}
          canScanLocally={canScanLocally}
          onScanned={(summary: ScanSummary) => show(summary.results, summary.message)}
          onInventory={setInventory}
          onCategoryScanned={(summary) => {
            setCategorySummary(summary);
            refresh();
          }}
        />

        {inventory && <InventoryPanel result={inventory} />}

        {categorySummary && <CategoryPanel summary={categorySummary} />}

        {(sortedResults.length > 0 || notice) && (
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              처리 결과
            </h2>

            {notice && (
              <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {notice}
              </p>
            )}

            {sortedResults.map((result, index) => (
              <div
                key={index}
                className={`rounded-lg px-3 py-2 text-sm ${STATUS_STYLE[result.status]}`}
              >
                <p className="font-medium">{STATUS_LABEL[result.status]}</p>
                <p className="mt-0.5">{result.message}</p>
                {result.warnings.map((warning) => (
                  <p key={warning} className="mt-1 text-xs opacity-80">
                    주의: {warning}
                  </p>
                ))}
              </div>
            ))}
          </section>
        )}

        <ChatPanel sourceFilter={sourceFilter} />

        <details className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-slate-600 dark:text-slate-300">
            폴더 대신 파일을 하나씩 첨부하기
          </summary>
          <div className="border-t border-slate-200 dark:border-slate-700">
            <UploadPanel onProcessed={show} />
          </div>
        </details>
      </div>

      <DocumentList
        documents={documents}
        loading={loading}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
      />
    </main>
  );
}

function rank(status: ProcessResult["status"]): number {
  if (status === "updated") return 0;
  if (status === "created") return 1;
  if (status === "error") return 2;
  return 3;
}
