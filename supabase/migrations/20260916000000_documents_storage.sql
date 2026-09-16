-- 문서 보관을 로컬 파일 시스템에서 Supabase(Storage + DB)로 옮기기 위한 스키마.
-- 배포된 Vercel 앱은 로컬 SharePoint 폴더에 접근할 수 없으므로, 스캔은 계속 관리자 로컬 PC에서
-- 실행하고 그 결과만 여기로 올려서 배포 사이트가 읽어가는 구조로 쓴다.

-- 문서(계보) 단위 메타데이터. 실제 파일 바이트는 담지 않고 versions 안에 storage 경로만 담는다.
create table if not exists public.documents (
  key text primary key,
  title text not null,
  aliases jsonb not null default '[]'::jsonb,
  versions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.documents enable row level security;

-- 로그인한 모든 사용자는 열람 가능 (CLAUDE.md 7번: 문서 열람은 로그인 사용자 전체 허용)
drop policy if exists "documents_select_authenticated" on public.documents;
create policy "documents_select_authenticated" on public.documents
  for select to authenticated using (true);

-- 쓰기는 서비스 역할(관리자 로컬 스캔 프로세스)만 한다. service_role은 RLS를 우회하므로
-- authenticated/anon용 insert/update/delete 정책은 만들지 않는다(=기본 거부).

-- 원본 PDF·추출 텍스트를 담는 비공개 버킷
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "documents_storage_select_authenticated" on storage.objects;
create policy "documents_storage_select_authenticated" on storage.objects
  for select to authenticated using (bucket_id = 'documents');
