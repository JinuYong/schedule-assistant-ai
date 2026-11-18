import type { User } from "../db/schema";
import type { AuthStore } from "./store";

/** 마지막으로 쓴 뒤 이만큼 안 쓰면 다시 로그인 */
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** 만료 연장은 하루에 한 번만 DB에 쓴다 */
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** 32바이트 난수 → base64url. 앱이 Authorization: Bearer로 보낸다 */
export function newSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

/** DB에는 토큰 원문 대신 SHA-256(hex)만 둔다 — DB가 새도 세션을 쓸 수 없게 */
export function hashToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

export async function startSession(store: AuthStore, userId: number, now = new Date()): Promise<string> {
  const token = newSessionToken();
  await store.createSession({
    userId,
    tokenHash: hashToken(token),
    now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });
  return token;
}

/** 토큰으로 사용자를 찾는다. 없거나 만료면 null. 쓸 때마다 만료를 밀어 준다(하루 단위) */
export async function resolveSession(store: AuthStore, token: string, now = new Date()): Promise<User | null> {
  const found = await store.findSession(hashToken(token));
  if (!found) return null;
  const { session, user } = found;
  if (session.expiresAt.getTime() <= now.getTime()) return null;
  if (now.getTime() - session.lastUsedAt.getTime() >= TOUCH_INTERVAL_MS) {
    await store.touchSession(session.id, now, new Date(now.getTime() + SESSION_TTL_MS));
  }
  return user;
}

export async function endSession(store: AuthStore, token: string): Promise<void> {
  await store.deleteSession(hashToken(token));
}
