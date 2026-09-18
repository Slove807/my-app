import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse는 서버에서 그대로 실행해야 하므로 번들에 포함하지 않는다
  serverExternalPackages: ["pdf-parse", "tesseract.js", "@napi-rs/canvas"],

  /**
   * 네이티브 바이너리(@napi-rs/canvas)와 OCR 엔진(tesseract.js-core)은 실행 중에 경로를 만들어
   * 불러오는 방식이라, 빌드 시 정적 분석으로는 "쓰인다"는 걸 알 수 없어 배포 함수에서 빠진다.
   * 실제로 이것 때문에 배포 사이트에서 모든 PDF가 "DOMMatrix is not defined"로 실패했다.
   * 문서를 처리하는 라우트에만 강제로 포함시킨다.
   */
  outputFileTracingIncludes: {
    "/api/documents": [
      "./node_modules/@napi-rs/canvas-*/**",
      "./node_modules/tesseract.js-core/**",
    ],
  },
};

export default nextConfig;
