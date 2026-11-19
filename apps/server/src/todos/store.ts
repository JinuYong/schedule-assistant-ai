import type {
  Todo,
  TodoChecklistItem,
  TodoImportance,
  TodoList,
  TodoRepeat,
} from "@cali/shared";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "../db";
import {
  todoChecklistItems,
  todoLists,
  todos,
  type TodoChecklistItemRow,
  type TodoRow,
} from "../db/schema";

/** 할일 한 건을 통째로 쓸 때의 값. 합치기·기본값·반복 계산은 routes.ts가 하고 저장소는 그대로 쓴다 */
export interface TodoInput {
  listId: number;
  title: string;
  memo: string;
  dueDate: string | null;
  importance: TodoImportance;
  repeat: TodoRepeat | null;
  reminderAt: Date | null;
  completedAt: Date | null;
  checklist: { title: string; checkedAt: Date | null }[];
}

/** 할일이 DB에 바라는 것. 모든 메서드가 userId로 주인을 거른다 — 남의 것이면 없는 것처럼(null·false).
 *  테스트는 메모리 구현(memory-store.ts) */
export interface TodoStore {
  lists(userId: number): Promise<TodoList[]>;
  createList(userId: number, name: string, now: Date): Promise<TodoList>;
  renameList(
    userId: number,
    listId: number,
    name: string,
  ): Promise<TodoList | null>;
  /** 목록 안 할일도 함께 지운다 */
  deleteList(userId: number, listId: number): Promise<boolean>;
  openTodos(userId: number): Promise<Todo[]>;
  /** 최근에 완료한 순 */
  completedTodos(userId: number, limit: number): Promise<Todo[]>;
  findTodo(userId: number, todoId: number): Promise<Todo | null>;
  insertTodo(userId: number, input: TodoInput, now: Date): Promise<Todo>;
  /** 체크리스트까지 통째로 덮어쓴다 */
  replaceTodo(
    userId: number,
    todoId: number,
    input: TodoInput,
    now: Date,
  ): Promise<Todo | null>;
  deleteTodo(userId: number, todoId: number): Promise<boolean>;
  checkItem(
    userId: number,
    todoId: number,
    itemId: number,
    checkedAt: Date | null,
    now: Date,
  ): Promise<TodoChecklistItem | null>;
  /** 완료 처리와 다음 회차 만들기를 한 번에(하나만 되면 반복이 끊기거나 겹친다) */
  completeWithNext(
    userId: number,
    todoId: number,
    done: TodoInput,
    next: TodoInput,
    now: Date,
  ): Promise<{ todo: Todo; next: Todo } | null>;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toTodo(row: TodoRow, items: TodoChecklistItemRow[]): Todo {
  return {
    id: row.id,
    listId: row.listId,
    title: row.title,
    memo: row.memo,
    dueDate: row.dueDate,
    importance: row.importance,
    repeat:
      row.repeatType && row.repeatInterval
        ? { type: row.repeatType, interval: row.repeatInterval }
        : null,
    reminderAt: iso(row.reminderAt),
    completedAt: iso(row.completedAt),
    checklist: items.toSorted((a, b) => a.position - b.position).map(toItem),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const toItem = (i: TodoChecklistItemRow): TodoChecklistItem => ({
  id: i.id,
  title: i.title,
  checkedAt: iso(i.checkedAt),
});

/** TodoInput → todos 칸(체크리스트 빼고) */
export const todoColumns = (input: TodoInput) => ({
  listId: input.listId,
  title: input.title,
  memo: input.memo,
  dueDate: input.dueDate,
  importance: input.importance,
  repeatType: input.repeat?.type ?? null,
  repeatInterval: input.repeat?.interval ?? null,
  reminderAt: input.reminderAt,
  completedAt: input.completedAt,
});

export function createDbTodoStore(db: Db): TodoStore {
  type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
  type Conn = Db | Tx;

  /** 할일 행들에 체크리스트를 붙인다 */
  async function withItems(conn: Conn, rows: TodoRow[]): Promise<Todo[]> {
    if (rows.length === 0) return [];
    const items = await conn
      .select()
      .from(todoChecklistItems)
      .where(
        inArray(
          todoChecklistItems.todoId,
          rows.map((r) => r.id),
        ),
      );
    return rows.map((r) =>
      toTodo(
        r,
        items.filter((i) => i.todoId === r.id),
      ),
    );
  }

  async function find(conn: Conn, userId: number, todoId: number) {
    const rows = await conn
      .select()
      .from(todos)
      .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
      .limit(1);
    return (await withItems(conn, rows))[0] ?? null;
  }

  async function writeItems(
    conn: Conn,
    todoId: number,
    checklist: TodoInput["checklist"],
  ) {
    if (checklist.length === 0) return;
    await conn.insert(todoChecklistItems).values(
      checklist.map((c, position) => ({
        todoId,
        title: c.title,
        checkedAt: c.checkedAt,
        position,
      })),
    );
  }

  async function insert(
    conn: Conn,
    userId: number,
    input: TodoInput,
    now: Date,
  ) {
    const [created] = await conn
      .insert(todos)
      .values({ ...todoColumns(input), userId, createdAt: now, updatedAt: now })
      .$returningId();
    if (!created) throw new Error("할일 저장 직후 id 없음");
    await writeItems(conn, created.id, input.checklist);
    const todo = await find(conn, userId, created.id);
    if (!todo) throw new Error("할일 저장 직후 조회 실패");
    return todo;
  }

  async function replace(
    conn: Conn,
    userId: number,
    todoId: number,
    input: TodoInput,
    now: Date,
  ) {
    const [res] = await conn
      .update(todos)
      .set({ ...todoColumns(input), updatedAt: now })
      .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
    if (res.affectedRows === 0) return null;
    await conn
      .delete(todoChecklistItems)
      .where(eq(todoChecklistItems.todoId, todoId));
    await writeItems(conn, todoId, input.checklist);
    return find(conn, userId, todoId);
  }

  return {
    async lists(userId) {
      return db
        .select({ id: todoLists.id, name: todoLists.name })
        .from(todoLists)
        .where(eq(todoLists.userId, userId))
        .orderBy(asc(todoLists.id));
    },

    async createList(userId, name, now) {
      const [created] = await db
        .insert(todoLists)
        .values({ userId, name, createdAt: now })
        .$returningId();
      if (!created) throw new Error("목록 저장 직후 id 없음");
      return { id: created.id, name };
    },

    async renameList(userId, listId, name) {
      const [res] = await db
        .update(todoLists)
        .set({ name })
        .where(and(eq(todoLists.id, listId), eq(todoLists.userId, userId)));
      // 같은 이름으로 바꾸면 MySQL은 affectedRows를 1로(바뀐 칸 수는 changedRows) 준다
      return res.affectedRows > 0 ? { id: listId, name } : null;
    },

    async deleteList(userId, listId) {
      const [res] = await db
        .delete(todoLists)
        .where(and(eq(todoLists.id, listId), eq(todoLists.userId, userId)));
      return res.affectedRows > 0;
    },

    async openTodos(userId) {
      const rows = await db
        .select()
        .from(todos)
        .where(and(eq(todos.userId, userId), isNull(todos.completedAt)))
        .orderBy(asc(todos.id));
      return withItems(db, rows);
    },

    async completedTodos(userId, limit) {
      const rows = await db
        .select()
        .from(todos)
        .where(and(eq(todos.userId, userId), isNotNull(todos.completedAt)))
        .orderBy(desc(todos.completedAt), desc(todos.id))
        .limit(limit);
      return withItems(db, rows);
    },

    findTodo: (userId, todoId) => find(db, userId, todoId),

    insertTodo: (userId, input, now) =>
      db.transaction((tx) => insert(tx, userId, input, now)),

    replaceTodo: (userId, todoId, input, now) =>
      db.transaction((tx) => replace(tx, userId, todoId, input, now)),

    async deleteTodo(userId, todoId) {
      const [res] = await db
        .delete(todos)
        .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
      return res.affectedRows > 0;
    },

    async checkItem(userId, todoId, itemId, checkedAt, now) {
      return db.transaction(async (tx) => {
        const [owned] = await tx
          .update(todos)
          .set({ updatedAt: now })
          .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
        if (owned.affectedRows === 0) return null;
        const [res] = await tx
          .update(todoChecklistItems)
          .set({ checkedAt })
          .where(
            and(
              eq(todoChecklistItems.id, itemId),
              eq(todoChecklistItems.todoId, todoId),
            ),
          );
        if (res.affectedRows === 0) return null;
        const [item] = await tx
          .select()
          .from(todoChecklistItems)
          .where(eq(todoChecklistItems.id, itemId))
          .limit(1);
        return item ? toItem(item) : null;
      });
    },

    completeWithNext(userId, todoId, done, next, now) {
      return db.transaction(async (tx) => {
        const todo = await replace(tx, userId, todoId, done, now);
        if (!todo) return null;
        return { todo, next: await insert(tx, userId, next, now) };
      });
    },
  };
}
