import path from "node:path";
import {
  DEFERRED_EXTENSIONS,
  OCR_ENABLED,
  OCR_MAX_PAGES,
  OCR_MIN_TEXT_CHARS,
  OCR_SCALE,
  SUPPORTED_EXTENSIONS,
} from "./config";
import { ocrImages } from "./ocr";

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

/** 본문 추출 결과. usedOcr이면 원문을 그대로 읽은 것이 아니라 OCR로 알아본 글자다 */
export type ExtractResult = { text: string; usedOcr: boolean };

/** 파일 내용에서 본문 텍스트를 추출한다 */
export async function extractText(
  buffer: Buffer,
  fileName: string,
): Promise<ExtractResult> {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === ".txt" || ext === ".md") {
    return { text: normalizeText(buffer.toString("utf8")), usedOcr: false };
  }

  if (ext === ".pdf") {
    const result = await extractPdf(buffer);
    return { text: normalizeText(result.text), usedOcr: result.usedOcr };
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

/**
 * pdfjs(=pdf-parse 내부)는 브라우저 API인 DOMMatrix·ImageData·Path2D가 있어야 로드된다.
 * Node에는 이 전역이 없어서 pdfjs가 스스로 @napi-rs/canvas를 동적 require로 가져와 채우는데,
 * 그 require는 문자열을 실행 중에 만들어 쓰는 방식이라 빌드 시 정적 분석에 잡히지 않는다.
 * 그래서 Vercel 함수 번들에 @napi-rs/canvas가 아예 빠지고, 폴리필이 조용히 실패한 뒤
 * "ReferenceError: DOMMatrix is not defined"로 PDF 처리가 전부 실패했다.
 * 여기서 직접 불러 전역을 먼저 채우면 번들에도 포함되고, pdfjs는 자기 폴리필을 건너뛴다.
 */
let pdfGlobalsReady: Promise<void> | null = null;

function ensurePdfGlobals(): Promise<void> {
  pdfGlobalsReady ??= (async () => {
    const canvas = await import("@napi-rs/canvas");
    const globals = globalThis as unknown as Record<string, unknown>;
    globals.DOMMatrix ??= canvas.DOMMatrix;
    globals.ImageData ??= canvas.ImageData;
    globals.Path2D ??= canvas.Path2D;
  })().catch((error: unknown) => {
    // 실패한 약속을 남겨 두면 다음 호출도 계속 같은 오류를 받으므로 비워 둔다
    pdfGlobalsReady = null;
    const reason = error instanceof Error ? error.message : String(error);
    throw new ExtractError(`PDF 처리에 필요한 @napi-rs/canvas를 불러오지 못했습니다: ${reason}`);
  });
  return pdfGlobalsReady;
}

async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  await ensurePdfGlobals();
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    // 쪽 구분자 같은 부스러기를 걷어낸 뒤에 판단한다. 스캔 PDF도 "-- 1 of 9 --"처럼
    // 글자 몇 개는 들어 있어서, 걷어내기 전에 보면 글자가 있는 문서로 잘못 보인다.
    const parsed = stripPageNoise(result.text);
    if (countLetters(parsed) >= OCR_MIN_TEXT_CHARS) return { text: parsed, usedOcr: false };

    // 읽을 만한 글자가 없으면 종이를 스캔한 이미지 PDF다. 쪽을 이미지로 만들어 OCR로 읽는다.
    if (!OCR_ENABLED) {
      throw new ExtractError(
        "PDF에서 글자를 찾지 못했습니다. 스캔 이미지 PDF를 읽으려면 OCR을 켜 주세요.",
      );
    }
    // 이미 열어 둔 문서를 그대로 써서 앞쪽 몇 장만 그림으로 만든다 (★기본정보는 표지 근처에 모여 있다)
    const shot = await parser.getScreenshot({
      first: OCR_MAX_PAGES,
      scale: OCR_SCALE,
      imageDataUrl: false,
    });
    const ocrText = await ocrImages(shot.pages.map((page) => page.data));
    if (!ocrText.trim()) {
      throw new ExtractError(
        "PDF에서 글자를 찾지 못했고 OCR로도 읽어내지 못했습니다. 원본을 확인해 주세요.",
      );
    }
    return { text: stripPageNoise(ocrText), usedOcr: true };
  } catch (error) {
    if (error instanceof ExtractError) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new ExtractError(`PDF를 읽지 못했습니다: ${reason}`);
  } finally {
    await parser.destroy();
  }
}

/** 공백을 뺀 실제 글자 수 */
function countLetters(text: string): number {
  return text.replace(/\s+/g, "").length;
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
