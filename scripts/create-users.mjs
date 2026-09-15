// 1회성 스크립트: 관리자/일반 사용자 예시 계정을 만들고 역할을 app_metadata에 심는다.
// 공개 회원가입이 없으므로, 계정은 이 스크립트로만 만든다.
// 실행: node --env-file=.env scripts/create-users.mjs
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function generatePassword() {
  return randomBytes(12).toString("base64url");
}

const accounts = [
  { email: "jmsong@jeisys.com", role: "admin" },
  { email: "thdwnaud1113@naver.com", role: "user" },
];

for (const account of accounts) {
  const password = generatePassword();
  const { data, error } = await supabase.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    app_metadata: { role: account.role },
  });

  if (error) {
    console.log(`[실패] ${account.email}: ${error.message}`);
    continue;
  }

  console.log(`[생성됨] ${account.email} (역할: ${account.role}, id: ${data.user.id})`);
  console.log(`  임시 비밀번호: ${password}`);
}
