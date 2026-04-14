import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Tauri 환경에서 불필요한 서버 기능 비활성화
  distDir: "out",
};

export default nextConfig;
