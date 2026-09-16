# 규제 변화 모니터링 시스템 (POC)

의료기기 인허가 담당자가 특정 폴더에 내부 규정·시험성적서 문서를 넣어 두면, 개정번호·개정일자를 기준으로 새 버전인지 자동으로 확인하고, 이전 버전과 비교해 무엇이 바뀌었는지 요약해 챗봇으로 답해 주는 프로젝트입니다.

같은 문서를 하나하나 열어 눈으로 비교하던 작업을 줄이고, 시험성적서의 기본정보(품목명·모델명·성적서 번호·시험기관·적용 규격 등)를 한눈에 정리해 보여주는 것이 목표입니다. 인허가 실무를 위한 사내 도구로 만든 **POC(개념 검증)** 단계 프로젝트입니다.

## 주요 기능

- **폴더 스캔**: 지정한 폴더(및 하위 폴더)를 훑어 PDF·TXT·MD 문서를 자동으로 찾아 보관합니다.
- **개정 감지 및 비교**: 개정번호·개정일자를 기준으로 새 버전인지 판단하고, 이전 버전과 본문을 비교해 변경 요약을 만듭니다. 기존 버전은 삭제하지 않고 그대로 보존합니다.
- **★기본정보 자동 추출**: 제품군·품목명·모델명·시험항목·성적서/보고서 번호·시험기관·발행일·개정번호·적용 규격·발행 및 개정사유를 문서 본문에서 읽어 정리합니다.
- **OCR 지원**: 종이를 스캔한 이미지 PDF는 본문에 글자가 없어 규칙으로 읽을 수 없는데, `tesseract.js`로 앞쪽 페이지를 OCR로 읽어 기본정보를 채웁니다. OCR로 읽은 내용에는 "오탈자 가능" 표시가 붙습니다.
- **적용 규격 최신판 확인**: 구글 검색으로 적용 규격의 더 새로운 판이 나왔는지 확인해 근거 링크와 함께 보여줍니다.
- **챗봇 문답**: 보관된 문서와 변경 이력을 근거로 질문에 답합니다. OpenAI API 키가 있으면 AI 요약을, 없으면 규칙 기반 요약을 사용합니다.
- **로그인 및 역할 분리**: Supabase Auth로 로그인하며(공개 회원가입 없음, 계정은 관리자가 직접 생성), 폴더 경로 변경·스캔 실행은 관리자만 할 수 있습니다.

## 기술 스택

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- Tailwind CSS
- [Supabase Auth](https://supabase.com/auth) — 이메일/비밀번호 로그인, 역할 기반 접근 제어
- [tesseract.js](https://github.com/naptha/tesseract.js) — 스캔 이미지 PDF OCR
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) — PDF 텍스트 추출 및 페이지 렌더링
- [OpenAI API](https://platform.openai.com/) (선택) — 변경 내용 AI 요약, 챗봇 답변
- Google Programmable Search API (선택) — 적용 규격 최신판 확인
- 배포: [Vercel](https://vercel.com)

## 로컬에서 실행하기

```bash
npm install
npm run dev
```

`http://localhost:3000`에서 확인할 수 있습니다.

### 환경 변수

프로젝트 루트에 `.env` 파일을 만들고 아래 값을 채워 주세요 (`.env.example` 참고). `.env`는 절대 git에 커밋하지 않습니다.

**필수 (로그인 기능에 필요)**

| 변수 | 설명 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable(anon) key |

**선택**

| 변수 | 설명 |
|---|---|
| `OPENAI_API_KEY` | 있으면 변경 요약·챗봇 답변을 AI로 생성합니다. 없으면 규칙 기반 요약으로 동작합니다. |
| `GOOGLE_API_KEY`, `GOOGLE_CSE_ID` | 있으면 적용 규격의 최신판을 구글 검색으로 확인합니다. |
| `SUPABASE_SERVICE_ROLE_KEY` | 로그인 계정을 만드는 `scripts/create-users.mjs` 실행 시에만 필요합니다 (배포된 앱은 사용하지 않습니다). |

이 밖에도 관리자 계정 생성, GitHub/Vercel CLI 인증 등 로컬 작업용 토큰이 더 있을 수 있으나, 배포된 앱 실행에는 필요하지 않습니다.

## 이번 POC에서 다루지 않는 것

- 법령정보센터·식약처 등 규제 사이트 자동 크롤링/모니터링 (적용 규격 최신판을 구글에서 확인하는 것은 예외)
- 공개 회원가입
- 규정에 대한 법률적 해석·자문 제공
- 이메일/슬랙 등 자동 알림
- 다국어 지원, 모바일 앱

자세한 기획 배경과 범위는 [`PRD.md`](PRD.md), 프로젝트 작업 규칙은 [`CLAUDE.md`](CLAUDE.md)를 참고하세요.
