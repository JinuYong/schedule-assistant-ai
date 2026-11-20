import {
  bigint,
  char,
  date,
  datetime,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  smallint,
  text,
  varchar,
} from "drizzle-orm/mysql-core";
import type { TodoRepeat } from "@cali/shared";

// serial은 기본 키 말고 UNIQUE 인덱스를 하나 더 만들어서 bigint 자동 증가로 쓴다
const id = () =>
  bigint({ mode: "number", unsigned: true }).autoincrement().primaryKey();

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

const userId = () =>
  bigint({ mode: "number", unsigned: true })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

export const todoLists = mysqlTable(
  "todo_lists",
  {
    id: id(),
    userId: userId(),
    name: varchar({ length: 100 }).notNull(),
    createdAt: datetime({ fsp: 3 }).notNull().$defaultFn(now),
  },
  (t) => [index("todo_lists_user_id_idx").on(t.userId)],
);

export const todos = mysqlTable(
  "todos",
  {
    id: id(),
    // 목록을 거치지 않고 바로 주인을 거르려고 둔다(모든 조회가 userId로 시작)
    userId: userId(),
    listId: bigint({ mode: "number", unsigned: true })
      .notNull()
      .references(() => todoLists.id, { onDelete: "cascade" }),
    title: varchar({ length: 500 }).notNull(),
    // TEXT는 리터럴 기본값을 못 가져서 앱에서 넣는다
    memo: text()
      .notNull()
      .$defaultFn(() => ""),
    /** 마감일(시각 없음). 사용자 달력 기준 날짜 그대로 */
    dueDate: date({ mode: "string" }),
    importance: mysqlEnum(["normal", "high"]).notNull().default("normal"),
    /** 반복 규칙(@cali/shared todoRepeat). 모양이 종류마다 달라 JSON으로 둔다 */
    repeat: json().$type<TodoRepeat>(),
    reminderAt: datetime({ fsp: 3 }),
    completedAt: datetime({ fsp: 3 }),
    createdAt: datetime({ fsp: 3 }).notNull().$defaultFn(now),
    updatedAt: datetime({ fsp: 3 }).notNull().$defaultFn(now),
  },
  // 미완료(completed_at IS NULL)와 최근 완료 순 조회 둘 다 이 인덱스로
  (t) => [index("todos_user_completed_idx").on(t.userId, t.completedAt)],
);

export const todoChecklistItems = mysqlTable("todo_checklist_items", {
  id: id(),
  todoId: bigint({ mode: "number", unsigned: true })
    .notNull()
    .references(() => todos.id, { onDelete: "cascade" }),
  title: varchar({ length: 500 }).notNull(),
  checkedAt: datetime({ fsp: 3 }),
  position: smallint({ unsigned: true }).notNull(),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type TodoListRow = typeof todoLists.$inferSelect;
export type TodoRow = typeof todos.$inferSelect;
export type TodoChecklistItemRow = typeof todoChecklistItems.$inferSelect;
