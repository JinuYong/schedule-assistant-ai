import { bigint, char, datetime, index, mysqlTable, varchar } from "drizzle-orm/mysql-core";

// serial은 기본 키 말고 UNIQUE 인덱스를 하나 더 만들어서 bigint 자동 증가로 쓴다
const id = () => bigint({ mode: "number", unsigned: true }).autoincrement().primaryKey();

// 시각은 모두 datetime(UTC)으로 저장한다. MySQL timestamp는 2038년까지만 담는다.
// DB 기본값(now()) 대신 앱에서 넣어 연결의 세션 시간대에 기대지 않는다(db/index.ts에서 timezone "Z").
const now = () => new Date();

export const users = mysqlTable("users", {
  id: id(),
  /** Google 계정 고유 ID(id_token의 sub). 이메일은 바뀔 수 있어 이것으로 사람을 찾는다 */
  googleSub: varchar({ length: 255 }).notNull().unique(),
  email: varchar({ length: 320 }).notNull(),
  name: varchar({ length: 200 }),
  pictureUrl: varchar({ length: 2048 }),
  createdAt: datetime({ fsp: 3 }).notNull().$defaultFn(now),
  lastLoginAt: datetime({ fsp: 3 }).notNull().$defaultFn(now),
});

export const sessions = mysqlTable(
  "sessions",
  {
    id: id(),
    userId: bigint({ mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 세션 토큰의 SHA-256(hex). 토큰 원문은 저장하지 않는다 */
    tokenHash: char({ length: 64 }).notNull().unique(),
    createdAt: datetime({ fsp: 3 }).notNull().$defaultFn(now),
    lastUsedAt: datetime({ fsp: 3 }).notNull().$defaultFn(now),
    expiresAt: datetime({ fsp: 3 }).notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
