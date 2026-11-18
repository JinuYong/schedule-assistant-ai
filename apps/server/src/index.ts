import { createApp } from "./app";
import { getEnv } from "./env";

const env = getEnv();

const app = createApp({
  corsOrigins: env.CORS_ORIGINS,
  checkDb: async () => {}, // T4에서 DB 연결로 바꾼다
});

console.log(`cali-api: http://localhost:${env.PORT}`);

export default { port: env.PORT, fetch: app.fetch };
