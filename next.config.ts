import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // 더미데이터 모드 플래그를 컴파일 타임 상수로 고정(기본 "0") → 프로덕션 빌드에서
  // 더미 코드가 완전히 트리셰이킹됨. `bun run dev`만 "1"로 켬.
  env: {
    NEXT_PUBLIC_MOCK: process.env.NEXT_PUBLIC_MOCK ?? "0",
  },
};

export default nextConfig;
