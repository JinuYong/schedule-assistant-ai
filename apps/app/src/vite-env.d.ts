/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_CLIENT_SECRET?: string;
  /** Cali 서버 주소. 없으면 개발은 http://localhost:8787, 배포 빌드는 https://cali-api.jinu.io (src/lib/api.ts) */
  readonly VITE_API_URL?: string;
  /** "1"이면 더미데이터 모드 (`bun run dev`) */
  readonly VITE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
