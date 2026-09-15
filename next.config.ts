import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse는 서버에서 그대로 실행해야 하므로 번들에 포함하지 않는다
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
