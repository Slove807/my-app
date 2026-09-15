import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Server Component·Server Action·Route Handler에서 쓰는 Supabase 클라이언트 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component에서 호출되면 실패할 수 있다.
            // proxy.ts가 세션을 갱신해 주므로 무시해도 된다.
          }
        },
      },
    },
  );
}
