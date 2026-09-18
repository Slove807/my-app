"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ProcessResult } from "@/lib/types";

type Props = {
  onProcessed: (results: ProcessResult[], notice?: string) => void;
};

type Mode = "files" | "folder";

const SUPPORTED_EXT = [".pdf", ".txt", ".md", ".hwp", ".hwpx"];

// 스캔본 PDF 한 건에 OCR만 수십 초가 걸린다(/api/documents는 maxDuration=300초).
// 폴더를 통째로 올릴 때도 요청 하나가 시간 제한에 걸리지 않게 조금씩 나눠 보낸다.
const PROCESS_BATCH_SIZE = 2;

// lib/config.ts의 스캔 제외 규칙과 맞춘다 (IFU·라벨·멸균지·국가별 추가요구사항 부속문서 제외).
// 브라우저(클라이언트) 코드라 서버 전용 모듈은 가져오지 않고 패턴만 그대로 옮겨 쓴다.
const EXCLUDED_NAME_PATTERNS = [/\bIFU\b/i, /장비\s*명판/, /라벨/, /멸균지/, /National\s*deviation/i];
const EXCLUDED_PATH_PATTERNS = [/\bIFU\b/i, /라벨/];

/** 파일명 확장자만 남기고 나머지는 임의 id로 바꾼다 (Storage 키는 아스키만 허용) */
function stagingFileName(originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  const ext = dot >= 0 ? originalName.slice(dot) : "";
  return `${crypto.randomUUID()}${ext}`;
}

function isSupportedFile(file: File): boolean {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  return SUPPORTED_EXT.includes(ext);
}

function isExcludedFile(file: File): boolean {
  const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  if (EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(file.name))) return true;
  return EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(relPath));
}

export default function UploadPanel({ onProcessed }: Props) {
  const [personalInfo, setPersonalInfo] = useState<"yes" | "no" | null>(null);
  const [selected, setSelected] = useState<File[]>([]);
  const [mode, setMode] = useState<Mode>("files");
  const [skippedCount, setSkippedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; phase: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // webkitdirectory는 표준 HTML 속성이 아니라 JSX에서 타입 지원이 안 되어 DOM으로 직접 설정한다
  useEffect(() => {
    const input = folderInputRef.current;
    if (!input) return;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }, []);

  function handleFilesPicked(fileList: FileList | null, pickedMode: Mode) {
    const all = Array.from(fileList ?? []);
    const kept = all.filter((file) => isSupportedFile(file) && !isExcludedFile(file));
    setSelected(kept);
    setSkippedCount(all.length - kept.length);
    setMode(pickedMode);
    setError(null);
  }

  async function handleUpload() {
    if (!personalInfo) {
      setError("개인정보 포함 여부를 먼저 선택해 주세요.");
      return;
    }
    if (selected.length === 0) {
      setError("첨부할 파일을 선택해 주세요.");
      return;
    }

    setBusy(true);
    setError(null);
    setProgress(null);

    const supabase = createClient();
    const staged: { path: string; originalName: string }[] = [];
    const allResults: ProcessResult[] = [];

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");

      // 큰 PDF를 서버 API로 그대로 보내면 Vercel 요청 본문 용량 제한에 걸리므로,
      // Supabase Storage에 먼저 직접 올려 두고 서버에는 경로만 알려준다.
      setProgress({ done: 0, total: selected.length, phase: "업로드" });
      for (const [index, file] of selected.entries()) {
        const path = `${user.id}/${stagingFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("uploads")
          .upload(path, file, { contentType: file.type || undefined });
        if (uploadError) throw new Error(`'${file.name}' 업로드 실패: ${uploadError.message}`);
        staged.push({ path, originalName: file.name });
        setProgress({ done: index + 1, total: selected.length, phase: "업로드" });
      }

      // 폴더 하나를 통째로 올리면 파일이 많아 시간 제한에 걸릴 수 있으므로 몇 개씩 나눠 처리한다
      const source = mode === "folder" ? "scan" : "upload";
      for (let i = 0; i < staged.length; i += PROCESS_BATCH_SIZE) {
        const batch = staged.slice(i, i + PROCESS_BATCH_SIZE);
        setProgress({ done: i, total: staged.length, phase: "분석" });
        const response = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ containsPersonalInfo: personalInfo, files: batch, source }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "처리에 실패했습니다.");
        allResults.push(...(data.results as ProcessResult[]));
        setProgress({ done: i + batch.length, total: staged.length, phase: "분석" });
      }

      onProcessed(allResults);
      if (filesInputRef.current) filesInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
      setSelected([]);
      setSkippedCount(0);
    } catch (caught) {
      // 서버가 이미 처리한(정리한) 배치를 뺀, 아직 처리되지 못한 임시 업로드 파일만 지운다
      const processedPaths = new Set(staged.slice(0, allResults.length).map((item) => item.path));
      const cleanup = staged.filter((item) => !processedPaths.has(item.path));
      if (cleanup.length > 0) {
        await supabase.storage.from("uploads").remove(cleanup.map((item) => item.path));
      }
      if (allResults.length > 0) onProcessed(allResults, "일부만 처리한 뒤 오류가 나 중단했습니다.");
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        직접 파일 첨부
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        폴더에 없는 문서를 하나씩 확인하거나, SharePoint 동기화 폴더를 통째로 골라 한 번에
        올릴 때 사용합니다. (PDF, TXT, MD)
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

      <div className="mt-4 space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            파일을 하나씩 선택
          </p>
          <input
            ref={filesInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.hwp,.hwpx"
            onChange={(event) => handleFilesPicked(event.target.files, "files")}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            또는 로컬(동기화된) 폴더를 통째로 선택
          </p>
          <input
            ref={folderInputRef}
            type="file"
            multiple
            onChange={(event) => handleFilesPicked(event.target.files, "folder")}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            브라우저가 폴더 안 파일을 직접 읽어 올리므로, 이 서버(배포 사이트 포함)가 로컬
            폴더에 접근할 필요가 없습니다.
          </p>
        </div>

        {selected.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              선택됨: {selected.length}개
              {skippedCount > 0 && ` (지원하지 않거나 제외 대상이라 ${skippedCount}개 건너뜀)`}
              {mode === "folder" && " · 로컬 폴더 스캔으로 표시됩니다"}
            </p>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-500 dark:text-slate-400">
              {selected.map((file) => (
                <li key={`${file.name}-${file.size}`}>
                  •{" "}
                  {(file as File & { webkitRelativePath?: string }).webkitRelativePath ||
                    file.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleUpload}
        disabled={busy}
        className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
      >
        {busy
          ? progress
            ? `${progress.phase} 중... (${progress.done}/${progress.total})`
            : "처리 중..."
          : "첨부하고 변경 내용 확인"}
      </button>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
    </section>
  );
}
