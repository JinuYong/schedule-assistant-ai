import {
  checkTodoItemBody,
  daysBetween,
  nextOccurrence,
  createTodoBody,
  todoListBody,
  updateTodoBody,
  type ApiError,
  type CompleteTodoResponse,
  type CompletedTodosResponse,
  type Todo,
  type TodoChecklistDraft,
  type TodoChecklistItemResponse,
  type TodoListResponse,
  type TodoResponse,
  type TodosResponse,
} from "@cali/shared";
import { Hono, type Context } from "hono";
import type { z } from "zod";
import { requireUser, type AuthDeps } from "../auth/routes";
import type { TodoInput, TodoStore } from "./store";

export interface TodoDeps {
  store: TodoStore;
}

/** 목록이 하나도 없는 사용자에게 처음 만들어 주는 목록 */
export const DEFAULT_LIST_NAME = "할일";
const COMPLETED_LIMIT = { default: 100, max: 500 };

const idParam = (s: string) => {
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

async function parseBody<T extends z.ZodType>(c: Context, schema: T) {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  return parsed.success ? (parsed.data as z.infer<T>) : null;
}

const toDate = (s: string | null) => (s ? new Date(s) : null);

/** 저장된 할일 → 다시 쓸 값 */
function inputOf(todo: Todo): TodoInput {
  return {
    listId: todo.listId,
    title: todo.title,
    memo: todo.memo,
    dueDate: todo.dueDate,
    importance: todo.importance,
    repeat: todo.repeat,
    reminderAt: toDate(todo.reminderAt),
    completedAt: toDate(todo.completedAt),
    checklist: todo.checklist.map((c) => ({
      title: c.title,
      checkedAt: toDate(c.checkedAt),
    })),
  };
}

/** 보낸 체크리스트로 갈아끼운다. 원래 체크돼 있던 항목은 체크 시각을 그대로 둔다 */
function mergeChecklist(
  current: Todo["checklist"],
  drafts: TodoChecklistDraft[],
  now: Date,
): TodoInput["checklist"] {
  return drafts.map((d) => {
    const prev = d.id ? current.find((c) => c.id === d.id) : undefined;
    return {
      title: d.title,
      checkedAt: d.checked ? (toDate(prev?.checkedAt ?? null) ?? now) : null,
    };
  });
}

const DAY_MS = 86_400_000;

/**
 * 반복 할일의 다음 회차: 마감일은 반복 규칙의 다음 날, 알림은 마감일이 밀린 만큼 같이 민다
 * (마감일 없이 알림만 있으면 알림 날짜(UTC)를 기준으로). 체크리스트는 모두 해제.
 */
function nextTodo(todo: Todo): TodoInput | null {
  const repeat = todo.repeat;
  if (!repeat) return null;
  const base = inputOf(todo);
  const from = todo.dueDate ?? todo.reminderAt?.slice(0, 10) ?? null;
  const shift = from ? daysBetween(from, nextOccurrence(from, repeat)) : 0;
  return {
    ...base,
    dueDate: todo.dueDate ? nextOccurrence(todo.dueDate, repeat) : null,
    reminderAt: base.reminderAt
      ? new Date(base.reminderAt.getTime() + shift * DAY_MS)
      : null,
    completedAt: null,
    checklist: base.checklist.map((c) => ({ ...c, checkedAt: null })),
  };
}

export function todoRoutes(authDeps: AuthDeps, deps: TodoDeps) {
  const now = authDeps.now ?? (() => new Date());
  const auth = requireUser(authDeps);
  const { store } = deps;

  const notFound = (c: Context) =>
    c.json<ApiError>({ error: "not_found" }, 404);
  const invalid = (c: Context) =>
    c.json<ApiError>({ error: "invalid_body" }, 400);
  const ownsList = async (userId: number, listId: number) =>
    (await store.lists(userId)).some((l) => l.id === listId);

  return (
    new Hono()
      // 목록 ----------------------------------------------------------------
      .post("/todo-lists", auth, async (c) => {
        const body = await parseBody(c, todoListBody);
        if (!body) return invalid(c);
        const list = await store.createList(c.get("user").id, body.name, now());
        return c.json<TodoListResponse>({ list }, 201);
      })
      .patch("/todo-lists/:id", auth, async (c) => {
        const id = idParam(c.req.param("id"));
        const body = await parseBody(c, todoListBody);
        if (!id) return notFound(c);
        if (!body) return invalid(c);
        const list = await store.renameList(c.get("user").id, id, body.name);
        return list ? c.json<TodoListResponse>({ list }) : notFound(c);
      })
      .delete("/todo-lists/:id", auth, async (c) => {
        const id = idParam(c.req.param("id"));
        if (!id || !(await store.deleteList(c.get("user").id, id)))
          return notFound(c);
        return c.body(null, 204);
      })

      // 할일 ----------------------------------------------------------------
      .get("/todos", auth, async (c) => {
        const userId = c.get("user").id;
        let lists = await store.lists(userId);
        if (lists.length === 0)
          lists = [await store.createList(userId, DEFAULT_LIST_NAME, now())];
        return c.json<TodosResponse>({
          lists,
          todos: await store.openTodos(userId),
        });
      })
      .get("/todos/completed", auth, async (c) => {
        const asked = idParam(c.req.query("limit") ?? "");
        const limit = Math.min(
          asked ?? COMPLETED_LIMIT.default,
          COMPLETED_LIMIT.max,
        );
        return c.json<CompletedTodosResponse>({
          todos: await store.completedTodos(c.get("user").id, limit),
        });
      })
      .post("/todos", auth, async (c) => {
        const userId = c.get("user").id;
        const body = await parseBody(c, createTodoBody);
        if (!body) return invalid(c);
        if (!(await ownsList(userId, body.listId))) return notFound(c);
        const at = now();
        const todo = await store.insertTodo(
          userId,
          {
            listId: body.listId,
            title: body.title,
            memo: body.memo ?? "",
            dueDate: body.dueDate ?? null,
            importance: body.importance ?? "normal",
            repeat: body.repeat ?? null,
            reminderAt: toDate(body.reminderAt ?? null),
            completedAt: null,
            checklist: mergeChecklist([], body.checklist ?? [], at),
          },
          at,
        );
        return c.json<TodoResponse>({ todo }, 201);
      })
      .patch("/todos/:id", auth, async (c) => {
        const userId = c.get("user").id;
        const id = idParam(c.req.param("id"));
        const body = await parseBody(c, updateTodoBody);
        if (!id) return notFound(c);
        if (!body) return invalid(c);
        const current = await store.findTodo(userId, id);
        if (!current) return notFound(c);
        if (
          body.listId !== undefined &&
          body.listId !== current.listId &&
          !(await ownsList(userId, body.listId))
        )
          return notFound(c);

        const at = now();
        const base = inputOf(current);
        const todo = await store.replaceTodo(
          userId,
          id,
          {
            ...base,
            listId: body.listId ?? base.listId,
            title: body.title ?? base.title,
            memo: body.memo ?? base.memo,
            importance: body.importance ?? base.importance,
            // null은 지우기, 안 보내면(undefined) 그대로
            dueDate: body.dueDate !== undefined ? body.dueDate : base.dueDate,
            repeat: body.repeat !== undefined ? body.repeat : base.repeat,
            reminderAt:
              body.reminderAt !== undefined
                ? toDate(body.reminderAt)
                : base.reminderAt,
            checklist: body.checklist
              ? mergeChecklist(current.checklist, body.checklist, at)
              : base.checklist,
          },
          at,
        );
        return todo ? c.json<TodoResponse>({ todo }) : notFound(c);
      })
      .delete("/todos/:id", auth, async (c) => {
        const id = idParam(c.req.param("id"));
        if (!id || !(await store.deleteTodo(c.get("user").id, id)))
          return notFound(c);
        return c.body(null, 204);
      })
      .post("/todos/:id/complete", auth, async (c) => {
        const userId = c.get("user").id;
        const id = idParam(c.req.param("id"));
        const current = id ? await store.findTodo(userId, id) : null;
        if (!id || !current) return notFound(c);
        // 이미 완료한 것을 다시 누르면 아무것도 하지 않는다(다음 회차가 겹치지 않게)
        if (current.completedAt)
          return c.json<CompleteTodoResponse>({ todo: current, next: null });

        const at = now();
        // 반복은 다음 회차로 넘긴다. 완료한 쪽에 남기면 되돌렸다 다시 완료할 때 회차가 또 생긴다
        const done: TodoInput = {
          ...inputOf(current),
          completedAt: at,
          repeat: null,
        };
        const next = nextTodo(current);
        if (next) {
          const res = await store.completeWithNext(userId, id, done, next, at);
          return res ? c.json<CompleteTodoResponse>(res) : notFound(c);
        }
        const todo = await store.replaceTodo(userId, id, done, at);
        return todo
          ? c.json<CompleteTodoResponse>({ todo, next: null })
          : notFound(c);
      })
      .post("/todos/:id/reopen", auth, async (c) => {
        const userId = c.get("user").id;
        const id = idParam(c.req.param("id"));
        const current = id ? await store.findTodo(userId, id) : null;
        if (!id || !current) return notFound(c);
        if (!current.completedAt)
          return c.json<TodoResponse>({ todo: current });
        const todo = await store.replaceTodo(
          userId,
          id,
          { ...inputOf(current), completedAt: null },
          now(),
        );
        return todo ? c.json<TodoResponse>({ todo }) : notFound(c);
      })
      .patch("/todos/:id/checklist/:itemId", auth, async (c) => {
        const id = idParam(c.req.param("id"));
        const itemId = idParam(c.req.param("itemId"));
        const body = await parseBody(c, checkTodoItemBody);
        if (!id || !itemId) return notFound(c);
        if (!body) return invalid(c);
        const at = now();
        const item = await store.checkItem(
          c.get("user").id,
          id,
          itemId,
          body.checked ? at : null,
          at,
        );
        return item ? c.json<TodoChecklistItemResponse>({ item }) : notFound(c);
      })
  );
}
