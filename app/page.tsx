import { redirect } from "next/navigation";
import Dashboard from "./components/Dashboard";
import { getCurrentUser } from "@/lib/auth";
import { CAN_SCAN_LOCAL_FOLDER } from "@/lib/config";

const ROLE_LABEL = { admin: "관리자", user: "일반 사용자" } as const;

export default async function Home() {
  const user = await getCurrentUser();
  // proxy.ts가 이미 로그인 여부를 확인하지만, 방어적으로 한 번 더 확인한다
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-5">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              규제 변화 모니터링 시스템
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              지정한 폴더의 문서를 개정번호·개정일자 기준으로 비교해 변경 내용을 정리합니다.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
              POC
            </span>
            <span className="text-sm text-slate-600 dark:text-slate-300">
              {user.email} · {ROLE_LABEL[user.role]}
            </span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>

      <Dashboard role={user.role} canScanLocally={CAN_SCAN_LOCAL_FOLDER} />
    </div>
  );
}
