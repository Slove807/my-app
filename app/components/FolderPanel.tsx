"use client";

import { useEffect, useState } from "react";
import type { CategoryScanSummary, InventoryResult, ScanSummary } from "@/lib/types";
import type { Role } from "@/lib/auth";

type Props = {
  role: Role;
  canScanLocally: boolean;
  onScanned: (summary: ScanSummary) => void;
  onInventory: (result: InventoryResult) => void;
  onCategoryScanned: (summary: CategoryScanSummary) => void;
};

export default function FolderPanel({
  role,
  canScanLocally,
  onScanned,
  onInventory,
  onCategoryScanned,
}: Props) {
  const [rootPath, setRootPath] = useState("");
  const [personalInfo, setPersonalInfo] = useState<"yes" | "no" | null>(null);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState<"none" | "inventory" | "scan" | "category">("none");
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data) => setRootPath(data.rootPath ?? ""))
      .catch(() => undefined);
  }, []);

  async function handleInventory() {
    if (!rootPath.trim()) {
      setError("문서가 있는 폴더 경로를 입력해 주세요.");
      return;
    }

    setBusy("inventory");
    setError(null);

    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootPath: rootPath.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "확인에 실패했습니다.");
      onInventory(data as InventoryResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy("none");
    }
  }

  async function handleCategoryScan() {
    if (!personalInfo) {
      setError("개인정보 포함 여부를 먼저 선택해 주세요.");
      return;
    }
    if (!rootPath.trim()) {
      setError("문서가 있는 폴더 경로를 입력해 주세요.");
      return;
    }

    setBusy("category");
    setError(null);

    try {
      const response = await fetch("/api/scan-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rootPath: rootPath.trim(),
          containsPersonalInfo: personalInfo === "yes",
          force,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "스캔에 실패했습니다.");
      onCategoryScanned(data as CategoryScanSummary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy("none");
    }
  }

  async function handleScan() {
    if (!personalInfo) {
      setError("개인정보 포함 여부를 먼저 선택해 주세요.");
      return;
    }
    if (!rootPath.trim()) {
      setError("문서가 있는 폴더 경로를 입력해 주세요.");
      return;
    }

    setBusy("scan");
    setError(null);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rootPath: rootPath.trim(),
          containsPersonalInfo: personalInfo === "yes",
          force,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "스캔에 실패했습니다.");
      setRemaining(data.remaining ?? 0);
      onScanned(data as ScanSummary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy("none");
    }
  }

  if (!canScanLocally) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          1. 문서 폴더 지정
        </h2>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          이 화면은 배포된 서버(Vercel)입니다. 배포 서버는 SharePoint와 동기화된 로컬 PC 폴더에
          접근할 수 없어 여기서는 폴더 스캔을 실행할 수 없습니다. 새 문서를 스캔하려면 관리자
          PC에서 <code className="font-mono">npm run dev</code>로 로컬 서버를 켜고 그곳에서
          스캔해 주세요 — 결과는 Supabase에 저장되어 이 배포 사이트에도 그대로 나타납니다.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        1. 문서 폴더 지정
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        SharePoint를 [동기화]로 PC에 연결한 폴더를 지정하면 하위 폴더까지 훑습니다. 원본 파일은
        읽기만 하고 옮기거나 고치지 않습니다.
      </p>

      <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">
        폴더 경로
      </label>
      <input
        value={rootPath}
        onChange={(event) => setRootPath(event.target.value)}
        placeholder="C:\Users\이름\회사\사이트 - 문서"
        spellCheck={false}
        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300"
      />

      <div className="mt-5 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
          파일 현황 확인
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          모든 형식(PDF·DOCX·HWP·XLSX 등)의 생성·삭제·수정·이름변경만 확인합니다. 본문을 열지
          않으므로 온라인 전용 파일이 내려받아지지 않습니다.
        </p>
        <button
          type="button"
          onClick={handleInventory}
          disabled={busy !== "none"}
          className="mt-3 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {busy === "inventory" ? "파일 목록을 확인하는 중..." : "파일 현황 확인"}
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
          본문 비교 (PDF)
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          PDF 본문을 읽어 개정번호·개정일자를 확인하고 이전 개정본과 비교합니다. 온라인 전용
          파일은 이때 실제로 내려받아지므로 폴더 범위를 좁게 잡는 것이 좋습니다.
        </p>

        {role !== "admin" ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            이 기능은 관리자만 사용할 수 있습니다.
          </p>
        ) : (
          <>
        <div className="mt-3">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            이 폴더의 문서에 개인정보가 포함되어 있나요?
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
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              경고: 개인정보가 포함된 문서입니다. 요약 결과를 외부에 공유하지 않도록 주의하세요.
              (그대로 진행됩니다)
            </p>
          )}
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={force}
            onChange={(event) => setForce(event.target.checked)}
            className="h-4 w-4"
          />
          지난번과 같은 파일도 전부 다시 검사
        </label>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleScan}
            disabled={busy !== "none"}
            className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            {busy === "scan"
              ? "본문을 비교하는 중..."
              : remaining > 0
                ? `이어서 스캔 (${remaining}건 남음)`
                : "폴더 전체 스캔"}
          </button>
          <button
            type="button"
            onClick={handleCategoryScan}
            disabled={busy !== "none"}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {busy === "category" ? "카테고리 확인 중..." : "12개 카테고리만 스캔 (POTENZA)"}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          &quot;12개 카테고리만&quot;은 Safety·EMC·멸균 밸리데이션 등 정해진 폴더만 훑습니다. (POTENZA 전용, 운송·포장은 대응 폴더가 없어 빈 항목으로 표시됩니다)
        </p>

        {remaining > 0 && busy === "none" && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            한 번에 일정 개수씩 나눠 처리합니다. 버튼을 다시 눌러 남은 문서를 이어서
            처리하세요.
          </p>
        )}
          </>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
    </section>
  );
}
