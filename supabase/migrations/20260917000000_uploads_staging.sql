-- "직접 파일 첨부" 기능은 로그인한 모든 사용자가 쓸 수 있는데(CLAUDE.md 7번), 큰 PDF를
-- Next.js API 라우트(Vercel 서버리스 함수)로 그대로 올리면 Vercel의 요청 본문 용량 제한에
-- 걸려 "Request Entity Too Large"가 난다. 그래서 브라우저가 Supabase Storage에 먼저 직접
-- 올리고, 서버는 Storage에서 그 파일을 내려받아 분석하는 방식으로 바꾼다.
-- 업로드 후에는 처리 여부와 무관하게 서버가 이 파일을 지운다(임시 보관용).
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', false, 125829120) -- 120MB (실제 상한은 프로젝트 설정이 우선)
on conflict (id) do nothing;

-- 경로를 "<자신의 user id>/파일" 형태로 강제해, 로그인한 사용자는 자기가 올린 파일만
-- 쓰고·읽고·지울 수 있게 한다.
drop policy if exists "uploads_insert_own" on storage.objects;
create policy "uploads_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "uploads_select_own" on storage.objects;
create policy "uploads_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "uploads_delete_own" on storage.objects;
create policy "uploads_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

-- "직접 파일 첨부"는 관리자만이 아니라 로그인한 모든 사용자가 쓰는 기능이라(스캔과 달리
-- app/api/documents가 requireAdmin()을 쓰지 않는다), documents 테이블/버킷 쓰기 권한도
-- admin 전용에서 로그인한 사용자 전체로 넓힌다. 폴더 스캔은 여전히 각 API 라우트의
-- requireAdmin()으로만 막혀 있다(이 완화로 스캔 접근 범위가 넓어지지 않는다).
drop policy if exists "documents_write_admin" on public.documents;
create policy "documents_write_authenticated" on public.documents
  for all to authenticated
  using (true)
  with check (true);

drop policy if exists "documents_storage_write_admin" on storage.objects;
create policy "documents_storage_write_authenticated" on storage.objects
  for all to authenticated
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');
