import type { TodoList } from "@cali/shared";
import type { TodoChecklistItemRow, TodoRow } from "../db/schema";
import {
  todoColumns,
  toItem,
  toTodo,
  type TodoInput,
  type TodoStore,
} from "./store";

/** 테스트용 TodoStore. DB 구현(store.ts)과 같은 규칙: 남의 것은 없는 것처럼, 목록을 지우면 할일도 */
export function createMemoryTodoStore(): TodoStore {
  const lists: (TodoList & { userId: number })[] = [];
  let rows: TodoRow[] = [];
  let items: TodoChecklistItemRow[] = [];
  let nextId = 1;

  const owned = (userId: number, todoId: number) =>
    rows.find((r) => r.id === todoId && r.userId === userId);
  const build = (row: TodoRow) =>
    toTodo(
      row,
      items.filter((i) => i.todoId === row.id),
    );
  const writeItems = (todoId: number, checklist: TodoInput["checklist"]) => {
    items = items.filter((i) => i.todoId !== todoId);
    checklist.forEach((c, position) =>
      items.push({
        id: nextId++,
        todoId,
        title: c.title,
        checkedAt: c.checkedAt,
        position,
      }),
    );
  };
  const insert = (userId: number, input: TodoInput, now: Date) => {
    const row: TodoRow = {
      id: nextId++,
      userId,
      ...todoColumns(input),
      createdAt: now,
      updatedAt: now,
    };
    rows.push(row);
    writeItems(row.id, input.checklist);
    return build(row);
  };
  const replace = (
    userId: number,
    todoId: number,
    input: TodoInput,
    now: Date,
  ) => {
    const row = owned(userId, todoId);
    if (!row) return null;
    Object.assign(row, todoColumns(input), { updatedAt: now });
    writeItems(row.id, input.checklist);
    return build(row);
  };

  return {
    async lists(userId) {
      return lists
        .filter((l) => l.userId === userId)
        .map(({ id, name }) => ({ id, name }));
    },
    async createList(userId, name) {
      const list = { id: nextId++, userId, name };
      lists.push(list);
      return { id: list.id, name };
    },
    async renameList(userId, listId, name) {
      const list = lists.find((l) => l.id === listId && l.userId === userId);
      if (!list) return null;
      list.name = name;
      return { id: listId, name };
    },
    async deleteList(userId, listId) {
      const i = lists.findIndex((l) => l.id === listId && l.userId === userId);
      if (i < 0) return false;
      lists.splice(i, 1);
      const gone = new Set(
        rows.filter((r) => r.listId === listId).map((r) => r.id),
      );
      rows = rows.filter((r) => !gone.has(r.id));
      items = items.filter((it) => !gone.has(it.todoId));
      return true;
    },
    async openTodos(userId) {
      return rows
        .filter((r) => r.userId === userId && !r.completedAt)
        .map(build);
    },
    async completedTodos(userId, limit) {
      return rows
        .filter((r) => r.userId === userId && r.completedAt)
        .toSorted(
          (a, b) =>
            b.completedAt!.getTime() - a.completedAt!.getTime() || b.id - a.id,
        )
        .slice(0, limit)
        .map(build);
    },
    async findTodo(userId, todoId) {
      const row = owned(userId, todoId);
      return row ? build(row) : null;
    },
    async insertTodo(userId, input, now) {
      return insert(userId, input, now);
    },
    async replaceTodo(userId, todoId, input, now) {
      return replace(userId, todoId, input, now);
    },
    async deleteTodo(userId, todoId) {
      if (!owned(userId, todoId)) return false;
      rows = rows.filter((r) => r.id !== todoId);
      items = items.filter((i) => i.todoId !== todoId);
      return true;
    },
    async checkItem(userId, todoId, itemId, checkedAt, now) {
      const row = owned(userId, todoId);
      const item = items.find((i) => i.id === itemId && i.todoId === todoId);
      if (!row || !item) return null;
      item.checkedAt = checkedAt;
      row.updatedAt = now;
      return toItem(item);
    },
    async completeWithNext(userId, todoId, done, next, now) {
      const todo = replace(userId, todoId, done, now);
      return todo ? { todo, next: insert(userId, next, now) } : null;
    },
  };
}
