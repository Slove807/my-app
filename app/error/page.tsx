import Link from "next/link";

export default function ErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          로그인에 실패했습니다
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          이메일 또는 비밀번호를 다시 확인해 주세요.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          로그인 화면으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
