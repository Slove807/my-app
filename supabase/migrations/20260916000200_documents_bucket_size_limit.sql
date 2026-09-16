-- 기본 업로드 용량 제한(50MB)보다 큰 EMC 성적서(약 60MB)가 있어, documents 버킷만
-- 앱의 MAX_FILE_BYTES(120MB, lib/config.ts)에 맞춰 한도를 올린다.
update storage.buckets
set file_size_limit = 125829120 -- 120 * 1024 * 1024
where id = 'documents';
