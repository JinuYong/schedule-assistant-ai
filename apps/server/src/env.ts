import { z } from "zod";

const list = (s: string) =>
  s
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

// Tauri 창의 출처: macOS·iOS는 tauri://localhost, Windows·Android는 http(s)://tauri.localhost.
// 개발 중 Vite(bun run dev:tauri)는 http://localhost:3100.
const DEFAULT_CORS_ORIGINS =
  "tauri://localhost,http://tauri.localhost,https://tauri.localhost,http://localhost:3100";

const schema = z.object({
  DATABASE_URL: z
    .string()
    .startsWith(
      "mysql://",
      "mysql://계정:비밀번호@호스트:포트/DB 형식이어야 합니다",
    ),
  /** id_token의 aud로 받을 Google OAuth 클라이언트 ID들(쉼표로 구분). 앱의 VITE_GOOGLE_CLIENT_ID와 같은 값 */
  GOOGLE_CLIENT_IDS: z.string().min(1).transform(list),
  PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGINS: z.string().default(DEFAULT_CORS_ORIGINS).transform(list),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** 환경 변수를 처음 부를 때 검증한다(테스트는 createApp에 값을 직접 넘겨 이 함수를 거치지 않는다). */
export function getEnv(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `- ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`환경 변수가 올바르지 않습니다:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const getDatabaseUrl = () => getEnv().DATABASE_URL;
