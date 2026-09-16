import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Supabase Storage 객체 키는 아스키 문자만 허용한다 (한글 등 유니코드가 섞이면 "Invalid key"
 * 오류가 난다. URL 인코딩을 해도 서버가 경로를 디코딩한 뒤 다시 검사해 소용없다).
 * 실제 파일명은 documents 테이블의 메타데이터(storedFile·textFile)에 그대로 보관하고,
 * Storage에는 이 해시 기반 경로로만 올린다.
 */
export function storageObjectKey(docKey: string, fileName: string): string {
  const ext = path.extname(fileName);
  const dir = createHash("sha1").update(docKey).digest("hex");
  const name = createHash("sha1").update(fileName).digest("hex");
  return `${dir}/${name}${ext}`;
}
