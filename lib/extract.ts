import path from "node:path";
import { DEFERRED_EXTENSIONS, SUPPORTED_EXTENSIONS } from "./config";

/** 텍스트 추출에 실패했을 때 사용자에게 보여줄 오류 */
export class ExtractError extends Error {}

/** 확장자가 이번 POC에서 다룰 수 있는 형식인지 확인한다 */
export function isKnownExtension(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return (
    (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext) ||
    (DEFERRED_EXTENSIONS as readonly string[]).includes(ext)
  );
}

/** 파일 내용에서 본문 텍스트를 추출한다 */
export async function extractText(
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === ".txt" || ext === ".md") {
    return normalizeText(buffer.toString("utf8"));
  }

  if (ext === ".pdf") {
    return normalizeText(await extractPdf(buffer));
  }

  if ((DEFERRED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new ExtractError(
      `${ext} 형식은 이번 POC에서 본문 추출을 지원하지 않습니다. PDF로 변환한 뒤 다시 첨부해 주세요.`,
    );
  }

  throw new ExtractError(
    `지원하지 않는 파일 형식입니다(${ext || "확장자 없음"}). PDF, TXT, MD 파일을 첨부해 주세요.`,
  );
}

// 페이지마다 반복되는 머리말·꼬리말은 내용 변경이 아니므로 걸러낸다
const PAGE_NOISE_PATTERNS = [
  /^--\s*[0-9]+\s+of\s+[0-9]+\s*--$/i,
  /^Page\s+[0-9]+\s+of\s+[0-9]+/i,
  /^TRF No\.\s*\S+$/i,
  /^[0-9]+\s*\/\s*[0-9]+$/,
];

async function extractPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    if (!result.text.trim()) {
      throw new ExtractError(
        "PDF에서 글자를 찾지 못했습니다. 스캔 이미지 PDF는 이번 POC에서 지원하지 않습니다.",
      );
    }
    return stripPageNoise(result.text);
  } catch (error) {
    if (error instanceof ExtractError) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new ExtractError(`PDF를 읽지 못했습니다: ${reason}`);
  } finally {
    await parser.destroy();
  }
}

function stripPageNoise(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !PAGE_NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
    })
    .join("\n");
}

/** 줄바꿈과 공백을 정리해 버전 간 비교가 흔들리지 않게 한다 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
