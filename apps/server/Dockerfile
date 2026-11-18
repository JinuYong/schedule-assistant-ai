# Cali API 서버 이미지. 빌드 컨텍스트는 저장소 루트(compose.yaml) — Bun workspaces라 루트 lockfile이 필요하다.
# 서버(OCI ARM)에서 직접 빌드한다. 공식 이미지가 arm64를 지원한다.
FROM oven/bun:1.3.6-slim

WORKDIR /repo
ENV NODE_ENV=production

# 의존성만 먼저 — 코드만 바뀐 배포는 이 층을 캐시로 건너뛴다.
# lockfile 검사를 통과하려면 모든 워크스페이스의 package.json이 있어야 한다(앱 것은 설치하지 않는다).
COPY package.json bun.lock ./
COPY apps/app/package.json apps/app/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --production --filter @cali/server

COPY packages/shared packages/shared
COPY apps/server apps/server

WORKDIR /repo/apps/server
USER bun
EXPOSE 8787

# 마이그레이션(drizzle/)을 적용한 뒤 요청을 받는다(src/index.ts). TS는 Bun이 바로 실행한다
CMD ["bun", "src/index.ts"]
