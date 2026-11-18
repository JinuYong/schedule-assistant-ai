import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { sessions, users, type User } from "../db/schema";
import type { GoogleProfile } from "./google";

export interface StoredSession {
  id: number;
  userId: number;
  lastUsedAt: Date;
  expiresAt: Date;
}

/** 인증이 DB에 바라는 것. 테스트는 메모리 구현을 쓴다(auth.test.ts) */
export interface AuthStore {
  /** Google sub로 찾아 있으면 이메일·이름·사진·마지막 로그인을 고치고, 없으면 만든다 */
  upsertGoogleUser(profile: GoogleProfile, now: Date): Promise<User>;
  createSession(input: { userId: number; tokenHash: string; now: Date; expiresAt: Date }): Promise<void>;
  findSession(tokenHash: string): Promise<{ session: StoredSession; user: User } | null>;
  touchSession(id: number, lastUsedAt: Date, expiresAt: Date): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
}

export function createDbAuthStore(db: Db): AuthStore {
  return {
    async upsertGoogleUser(p, now) {
      await db
        .insert(users)
        .values({ googleSub: p.sub, email: p.email, name: p.name, pictureUrl: p.pictureUrl, createdAt: now, lastLoginAt: now })
        .onDuplicateKeyUpdate({
          set: { email: p.email, name: p.name, pictureUrl: p.pictureUrl, lastLoginAt: now },
        });
      const [user] = await db.select().from(users).where(eq(users.googleSub, p.sub)).limit(1);
      if (!user) throw new Error("사용자 저장 직후 조회 실패");
      return user;
    },

    async createSession({ userId, tokenHash, now, expiresAt }) {
      await db.insert(sessions).values({ userId, tokenHash, createdAt: now, lastUsedAt: now, expiresAt });
    },

    async findSession(tokenHash) {
      const [row] = await db
        .select({ session: sessions, user: users })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1);
      return row ?? null;
    },

    async touchSession(id, lastUsedAt, expiresAt) {
      await db.update(sessions).set({ lastUsedAt, expiresAt }).where(eq(sessions.id, id));
    },

    async deleteSession(tokenHash) {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },
  };
}

/** 만료된 세션 정리(서버 기동 때 한 번). 실패해도 서비스에는 지장 없다 */
export async function deleteExpiredSessions(db: Db, now = new Date()) {
  await db.delete(sessions).where(sql`${sessions.expiresAt} < ${now}`);
}
