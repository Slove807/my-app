// 1회성 스크립트: 로컬 data/archive에 쌓인 문서(원본 PDF·추출 텍스트·메타데이터)를
// Supabase(Storage documents 버킷 + documents 테이블)로 옮긴다.
// 이미 올라간 파일/레코드는 upsert로 덮어써도 안전하므로 몇 번을 다시 돌려도 된다.
// 실행: node --env-file=.env scripts/migrate-archive-to-supabase.mjs
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ARCHIVE_DIR = path.join(process.cwd(), "data", "archive");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function guessContentType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".md") return "text/markdown; charset=utf-8";
  return "text/plain; charset=utf-8";
}

// Supabase Storage 키는 아스키만 허용한다(한글 파일명이면 "Invalid key" 오류).
// lib/storagePath.ts의 storageObjectKey()와 반드시 같은 규칙을 써야 한다.
function storageObjectKey(docKey, fileName) {
  const ext = path.extname(fileName);
  const dir = createHash("sha1").update(docKey).digest("hex");
  const name = createHash("sha1").update(fileName).digest("hex");
  return `${dir}/${name}${ext}`;
}

async function uploadFile(docKey, fileName) {
  const localPath = path.join(ARCHIVE_DIR, docKey, fileName);
  const buffer = await readFile(localPath);
  const key = storageObjectKey(docKey, fileName);
  const { error } = await supabase.storage.from("documents").upload(key, buffer, {
    contentType: guessContentType(fileName),
    upsert: true,
  });
  if (error) throw new Error(`업로드 실패(${docKey}/${fileName} → ${key}): ${error.message}`);
  return buffer.length;
}

async function migrateOne(docKey) {
  const metaPath = path.join(ARCHIVE_DIR, docKey, "meta.json");
  const record = JSON.parse(await readFile(metaPath, "utf8"));

  let bytes = 0;
  for (const version of record.versions ?? []) {
    if (version.storedFile) bytes += await uploadFile(docKey, version.storedFile);
    if (version.textFile) bytes += await uploadFile(docKey, version.textFile);
    if (version.certificate?.storedFile) bytes += await uploadFile(docKey, version.certificate.storedFile);
  }

  const { error } = await supabase.from("documents").upsert({
    key: record.key,
    title: record.title,
    aliases: record.aliases ?? [],
    versions: record.versions ?? [],
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`메타데이터 저장 실패(${docKey}): ${error.message}`);

  return bytes;
}

const entries = await readdir(ARCHIVE_DIR, { withFileTypes: true });
const docKeys = [];
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const info = await stat(path.join(ARCHIVE_DIR, entry.name, "meta.json")).catch(() => null);
  if (info) docKeys.push(entry.name);
}

console.log(`이관 대상 ${docKeys.length}건`);

let done = 0;
let totalBytes = 0;
const failed = [];

for (const docKey of docKeys) {
  try {
    const bytes = await migrateOne(docKey);
    totalBytes += bytes;
    done += 1;
    console.log(`[${done}/${docKeys.length}] ${docKey} (${(bytes / 1024 / 1024).toFixed(1)}MB)`);
  } catch (error) {
    failed.push({ docKey, message: error.message });
    console.error(`[실패] ${docKey}: ${error.message}`);
  }
}

console.log("---");
console.log(`완료: ${done}/${docKeys.length}건, 총 ${(totalBytes / 1024 / 1024).toFixed(1)}MB`);
if (failed.length > 0) {
  console.log(`실패 ${failed.length}건:`);
  for (const item of failed) console.log(`  - ${item.docKey}: ${item.message}`);
  process.exitCode = 1;
}
