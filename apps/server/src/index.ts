import { createApp } from "./app";
import { createGoogleVerifier } from "./auth/google";
import { createDbAuthStore, deleteExpiredSessions } from "./auth/store";
import { createDb } from "./db";
import { runMigrations } from "./db/migrate";
import { getEnv } from "./env";
import { createDbMemoStore } from "./memos/store";
import { createNaverPlaceSearch } from "./places/naver";
import { createDbTodoStore } from "./todos/store";

const env = getEnv();
const conn = createDb(env.DATABASE_URL);

// 스키마를 맞춘 뒤에 요청을 받는다. 실패하면 프로세스가 죽고 배포의 기동 확인이 직전 이미지로 되돌린다
await runMigrations(conn.db);
await deleteExpiredSessions(conn.db).catch((err) =>
  console.warn("[startup] 만료 세션 정리 실패", err),
);

const app = createApp({
  corsOrigins: env.CORS_ORIGINS,
  checkDb: conn.check,
  auth: {
    store: createDbAuthStore(conn.db),
    verifyGoogle: createGoogleVerifier({ audiences: env.GOOGLE_CLIENT_IDS }),
  },
  todos: { store: createDbTodoStore(conn.db) },
  memos: { store: createDbMemoStore(conn.db) },
  places: {
    search:
      env.NAVER_SEARCH_CLIENT_ID && env.NAVER_SEARCH_CLIENT_SECRET
        ? createNaverPlaceSearch({
            clientId: env.NAVER_SEARCH_CLIENT_ID,
            clientSecret: env.NAVER_SEARCH_CLIENT_SECRET,
          })
        : undefined,
  },
});

if (!env.NAVER_SEARCH_CLIENT_ID || !env.NAVER_SEARCH_CLIENT_SECRET)
  console.warn("[startup] NAVER_SEARCH_* 가 없어 장소 검색이 꺼져 있습니다");

console.log(`cali-api: http://localhost:${env.PORT}`);

export default { port: env.PORT, fetch: app.fetch };
