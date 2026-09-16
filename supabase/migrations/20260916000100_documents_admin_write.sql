-- 관리자(app_metadata.role = 'admin')는 자기 로그인 세션으로 문서를 쓸 수 있게 한다.
-- 별도의 서비스 롤 키 없이도 로컬 스캔(관리자 로그인 상태)에서 바로 쓸 수 있도록 하기 위함이며,
-- 배포된 사이트에서도 이 정책이 그대로 적용되지만 실제로는 로컬 폴더가 없어 스캔 자체가 실행되지 않는다.

drop policy if exists "documents_write_admin" on public.documents;
create policy "documents_write_admin" on public.documents
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "documents_storage_write_admin" on storage.objects;
create policy "documents_storage_write_admin" on storage.objects
  for all to authenticated
  using (bucket_id = 'documents' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check (bucket_id = 'documents' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
