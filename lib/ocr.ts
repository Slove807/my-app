import { OCR_LANGUAGES, OCR_WORKERS } from "./config";

/**
 * 스캔(이미지)으로만 된 PDF의 쪽 그림에서 글자를 읽어낸다.
 *
 * 보관 문서의 절반 이상이 종이를 스캔한 PDF라 본문에 글자가 한 자도 없다. 이런 문서는
 * 쪽을 그림으로 만든 뒤(extract.ts) 여기서 OCR로 읽는다. 읽어낸 글자는 원본을 그대로 옮긴
 * 것이 아니라 기계가 알아본 결과라 오탈자가 섞일 수 있으므로, 화면에 OCR로 읽었음을 표시한다.
 */

type Scheduler = Awaited<ReturnType<typeof createOcrScheduler>>;

// 워커는 만드는 데 시간이 걸리고 언어 데이터도 내려받아야 해서 한 번 만들어 재사용한다
let schedulerPromise: Promise<Scheduler> | null = null;

async function createOcrScheduler() {
  const { createScheduler, createWorker } = await import("tesseract.js");
  const scheduler = createScheduler();
  for (let index = 0; index < OCR_WORKERS; index += 1) {
    scheduler.addWorker(await createWorker(OCR_LANGUAGES));
  }
  return scheduler;
}

async function getScheduler(): Promise<Scheduler> {
  if (!schedulerPromise) {
    schedulerPromise = createOcrScheduler().catch((error) => {
      // 실패한 약속을 남겨 두면 다음 호출도 계속 같은 오류를 받으므로 비워 둔다
      schedulerPromise = null;
      throw error;
    });
  }
  return schedulerPromise;
}

/** 쪽 그림들을 OCR로 읽어 글자를 돌려준다 */
export async function ocrImages(images: Uint8Array[]): Promise<string> {
  if (images.length === 0) return "";

  const scheduler = await getScheduler();
  const results = await Promise.all(
    images.map((image) => scheduler.addJob("recognize", Buffer.from(image))),
  );
  return results.map((result) => result.data.text).join("\n");
}
