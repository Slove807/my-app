import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { ARCHIVE_DIR } from "@/lib/config";
import { getDocument } from "@/lib/store";

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

// docKey는 makeDocKey()에서 이 문자 집합으로만 만들어진다. 경로 조작(../ 등)을 막기 위해 확인한다
const SAFE_DOC_KEY = /^[0-9A-Za-z가-힣_]+$/;

/**
 * 보관된 원본 파일(성적서 본문 또는 거기 첨부된 CB Certificate)을 그대로 내려준다.
 * 클릭하면 새 탭에서 바로 열람할 수 있도록 Content-Disposition을 inline으로 준다 (요청 3번).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docKey: string }> },
) {
  const { docKey } = await params;
  if (!SAFE_DOC_KEY.test(docKey)) {
    return NextResponse.json({ error: "잘못된 문서 키입니다." }, { status: 400 });
  }

  const record = await getDocument(docKey);
  if (!record) {
    return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  const versionParam = request.nextUrl.searchParams.get("version");
  const versionNo = versionParam ? Number(versionParam) : record.versions.at(-1)?.version;
  const version = record.versions.find((item) => item.version === versionNo);
  if (!version) {
    return NextResponse.json({ error: "버전을 찾을 수 없습니다." }, { status: 404 });
  }

  const wantsCertificate = request.nextUrl.searchParams.get("cert") === "1";
  const target = wantsCertificate ? version.certificate : version;
  if (!target) {
    return NextResponse.json({ error: "첨부된 CB Certificate가 없습니다." }, { status: 404 });
  }

  const filePath = path.join(ARCHIVE_DIR, record.key, target.storedFile);
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    return NextResponse.json({ error: "원본 파일을 읽지 못했습니다." }, { status: 404 });
  }

  const ext = path.extname(target.storedFile).toLowerCase();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(target.originalName)}"`,
    },
  });
}
