import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse는 서버에서 그대로 실행해야 하므로 번들에 포함하지 않는다
  serverExternalPackages: ["pdf-parse", "tesseract.js", "@napi-rs/canvas"],

  /**
   * PDF·OCR 쪽 패키지들은 필요한 파일을 "실행 중에 경로를 만들어" 불러온다.
   * (pdfjs는 pdf.worker.mjs를 동적 import, @napi-rs/canvas는 플랫폼별 .node를 동적 require,
   *  tesseract.js는 코어 wasm과 워커 스크립트를 동적 resolve)
   * 이런 참조는 빌드 시 정적 분석에 잡히지 않아 배포 함수 번들에서 통째로 빠지고,
   * 로컬에서는 node_modules가 다 있으니 드러나지 않다가 배포 후에야 하나씩 터진다.
   * (실제로 DOMMatrix → pdf.worker.mjs 순으로 연달아 실패했다.)
   * 그래서 런타임에 필요한 자산을 문서 처리 라우트에 명시적으로 포함시킨다.
   */
  outputFileTracingIncludes: {
    "/api/documents": [
      // pdfjs 본체 + 워커(동적 import 대상)
      "./node_modules/pdfjs-dist/legacy/build/**",
      // CJK(한글) 인코딩·기본 폰트·이미지 코덱(JPX/JBIG2 등 스캔본에서 쓰임)
      "./node_modules/pdfjs-dist/cmaps/**",
      "./node_modules/pdfjs-dist/standard_fonts/**",
      "./node_modules/pdfjs-dist/wasm/**",
      // DOMMatrix 폴리필을 제공하는 네이티브 모듈(플랫폼별 바이너리 포함)
      "./node_modules/@napi-rs/canvas-*/**",
      // OCR 엔진 wasm과 워커 스크립트
      "./node_modules/tesseract.js-core/**",
      "./node_modules/tesseract.js/**",
    ],
  },
};

export default nextConfig;
