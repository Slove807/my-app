import { createClient } from "./supabase/server";

export type Role = "admin" | "user";

/**
 * 로그인한 사용자의 이메일과 역할을 돌려준다.
 * 역할은 Supabase Auth 사용자의 app_metadata에 저장되어 있다.
 * (user_metadata와 달리 본인이 API로 바꿀 수 없어 권한 값으로 쓴다)
 */
export async function getCurrentUser(): Promise<{ email: string; role: Role } | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const role: Role = claims.app_metadata?.role === "admin" ? "admin" : "user";
  return { email: claims.email ?? "", role };
}

/**
 * 관리자 전용 API 라우트 맨 앞에서 호출한다.
 * 관리자가 아니면 403 응답을 돌려주고, 호출한 쪽에서는 그 응답을 그대로 반환하면 된다.
 * 로그인 자체는 proxy.ts가 이미 확인했으므로 여기서는 역할만 본다.
 */
export async function requireAdmin(): Promise<Response | null> {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return Response.json(
      { error: "이 기능은 관리자만 사용할 수 있습니다." },
      { status: 403 },
    );
  }
  return null;
}
