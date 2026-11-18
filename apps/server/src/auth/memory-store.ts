import type { User } from "../db/schema";
import type { AuthStore, StoredSession } from "./store";

/** 테스트용 AuthStore. DB 구현(store.ts)과 같은 규칙: sub로 사람을 찾고, 토큰 해시로 세션을 찾는다 */
export function createMemoryAuthStore() {
  const users = new Map<string, User>(); // googleSub → user
  const sessions = new Map<string, StoredSession>(); // tokenHash → session
  let nextUserId = 1;
  let nextSessionId = 1;

  const store: AuthStore = {
    async upsertGoogleUser(p, now) {
      const prev = users.get(p.sub);
      const user: User = prev
        ? { ...prev, email: p.email, name: p.name, pictureUrl: p.pictureUrl, lastLoginAt: now }
        : { id: nextUserId++, googleSub: p.sub, email: p.email, name: p.name, pictureUrl: p.pictureUrl, createdAt: now, lastLoginAt: now };
      users.set(p.sub, user);
      return user;
    },
    async createSession({ userId, tokenHash, now, expiresAt }) {
      sessions.set(tokenHash, { id: nextSessionId++, userId, lastUsedAt: now, expiresAt });
    },
    async findSession(tokenHash) {
      const session = sessions.get(tokenHash);
      if (!session) return null;
      const user = [...users.values()].find((u) => u.id === session.userId);
      return user ? { session, user } : null;
    },
    async touchSession(id, lastUsedAt, expiresAt) {
      for (const s of sessions.values()) if (s.id === id) Object.assign(s, { lastUsedAt, expiresAt });
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },
  };

  return Object.assign(store, { users, sessions });
}
