import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 매 요청마다 세션을 갱신한다 (Supabase 공식 예제 그대로).
 * 다만 이 앱은 화면이 /api/*를 fetch로 호출하므로, 로그인 안 된 API 요청까지
 * HTML 리다이렉트를 보내면 response.json()이 깨진다. 그래서 /api/*는
 * 리다이렉트 대신 401 JSON을 돌려주도록만 원본 예제에서 바꿨다.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Fluid compute를 쓸 때는 이 클라이언트를 전역 변수에 두지 말고
  // 매 요청마다 새로 만들어야 한다.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // createServerClient와 getClaims() 사이에는 다른 코드를 넣지 않는다.
  // 여기서 실수하면 사용자가 이유 없이 로그아웃되는 문제를 디버깅하기 매우 어려워진다.

  // 주의: getClaims()를 지우면 서버 사이드 렌더링을 쓸 때 사용자가
  // 무작위로 로그아웃될 수 있다.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");
  const isPublicRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    request.nextUrl.pathname.startsWith("/error");

  if (!user && !isPublicRoute) {
    if (isApiRoute) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 반드시 supabaseResponse 객체를 그대로 반환해야 한다. 새 응답 객체를 만들 때는:
  // 1. request를 그대로 넘기고 (NextResponse.next({ request }))
  // 2. 쿠키를 복사하고 (myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll()))
  // 3. 쿠키 자체는 바꾸지 않아야 한다
  // 이렇게 하지 않으면 브라우저와 서버 세션이 어긋나 로그인이 예기치 않게 끊길 수 있다.
  return supabaseResponse;
}
