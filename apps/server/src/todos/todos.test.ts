import { beforeEach, describe, expect, test } from "bun:test";
import type {
  CompleteTodoResponse,
  CompletedTodosResponse,
  Todo,
  TodoListResponse,
  TodoResponse,
  TodosResponse,
} from "@cali/shared";
import { createApp } from "../app";
import { createMemoryAuthStore } from "../auth/memory-store";
import { startSession } from "../auth/session";
import { createMemoryTodoStore } from "./memory-store";
import { DEFAULT_LIST_NAME } from "./routes";

let app: ReturnType<typeof createApp>;
let clock: Date;
let me: string;
let other: string;

beforeEach(async () => {
  const auth = createMemoryAuthStore();
  clock = new Date("2026-11-20T00:00:00.000Z");
  app = createApp({
    corsOrigins: [],
    checkDb: async () => {},
    auth: {
      store: auth,
      verifyGoogle: async () => {
        throw new Error("안 부른다");
      },
      now: () => clock,
    },
    todos: { store: createMemoryTodoStore() },
  });
  const signIn = async (sub: string) => {
    const user = await auth.upsertGoogleUser(
      { sub, email: `${sub}@example.com`, name: null, pictureUrl: null },
      clock,
    );
    return startSession(auth, user.id, clock);
  };
  me = await signIn("me");
  other = await signIn("other");
});

async function call<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : null) as T };
}

/** 처음 조회로 기본 목록을 받고 그 목록 id를 돌려준다 */
async function defaultListId(token = me) {
  const { data } = await call<TodosResponse>(token, "GET", "/todos");
  return data.lists[0]!.id;
}

async function create(body: Record<string, unknown>, token = me) {
  const res = await call<TodoResponse>(token, "POST", "/todos", body);
  expect(res.status).toBe(201);
  return res.data.todo;
}

test("로그인 없이는 401", async () => {
  const res = await app.request("/todos");
  expect(res.status).toBe(401);
});

describe("목록", () => {
  test("처음 조회하면 기본 목록이 하나 생긴다(두 번째엔 그대로)", async () => {
    const first = await call<TodosResponse>(me, "GET", "/todos");
    expect(first.data.lists).toEqual([
      { id: expect.any(Number), name: DEFAULT_LIST_NAME },
    ]);
    const second = await call<TodosResponse>(me, "GET", "/todos");
    expect(second.data.lists).toEqual(first.data.lists);
  });

  test("만들기·이름 바꾸기·지우기(안의 할일도 함께)", async () => {
    const created = await call<TodoListResponse>(me, "POST", "/todo-lists", {
      name: " 장보기 ",
    });
    expect(created.status).toBe(201);
    const listId = created.data.list.id;
    expect(created.data.list.name).toBe("장보기");

    const renamed = await call<TodoListResponse>(
      me,
      "PATCH",
      `/todo-lists/${listId}`,
      { name: "마트" },
    );
    expect(renamed.data.list).toEqual({ id: listId, name: "마트" });

    await create({ listId, title: "우유" });
    expect((await call(me, "DELETE", `/todo-lists/${listId}`)).status).toBe(
      204,
    );
    const { data } = await call<TodosResponse>(me, "GET", "/todos");
    expect(data.lists.map((l) => l.name)).toEqual([DEFAULT_LIST_NAME]);
    expect(data.todos).toEqual([]);
  });

  test("빈 이름은 400, 남의 목록은 404", async () => {
    expect((await call(me, "POST", "/todo-lists", { name: " " })).status).toBe(
      400,
    );
    const theirs = await defaultListId(other);
    expect(
      (await call(me, "PATCH", `/todo-lists/${theirs}`, { name: "x" })).status,
    ).toBe(404);
    expect((await call(me, "DELETE", `/todo-lists/${theirs}`)).status).toBe(
      404,
    );
  });
});

describe("할일", () => {
  test("만들면 생략한 칸은 빈 값, 체크한 항목엔 체크 시각", async () => {
    const listId = await defaultListId();
    const todo = await create({
      listId,
      title: "보고서",
      checklist: [
        { title: "초안", checked: true },
        { title: "검토", checked: false },
      ],
    });
    expect(todo).toMatchObject({
      listId,
      title: "보고서",
      memo: "",
      dueDate: null,
      importance: "normal",
      repeat: null,
      reminderAt: null,
      completedAt: null,
    });
    expect(todo.checklist).toEqual([
      { id: expect.any(Number), title: "초안", checkedAt: clock.toISOString() },
      { id: expect.any(Number), title: "검토", checkedAt: null },
    ]);
  });

  test("남의 목록에 만들 수 없고, 남의 할일은 보이지도 바뀌지도 않는다", async () => {
    const theirList = await defaultListId(other);
    expect(
      (await call(me, "POST", "/todos", { listId: theirList, title: "x" }))
        .status,
    ).toBe(404);

    const theirs = await create({ listId: theirList, title: "비밀" }, other);
    expect((await call<TodosResponse>(me, "GET", "/todos")).data.todos).toEqual(
      [],
    );
    for (const [method, path, body] of [
      ["PATCH", `/todos/${theirs.id}`, { title: "x" }],
      ["DELETE", `/todos/${theirs.id}`, undefined],
      ["POST", `/todos/${theirs.id}/complete`, undefined],
      ["POST", `/todos/${theirs.id}/reopen`, undefined],
      ["PATCH", `/todos/${theirs.id}/checklist/1`, { checked: true }],
    ] as const)
      expect((await call(me, method, path, body)).status).toBe(404);
  });

  test("고치면 보낸 칸만 바뀌고 null은 지운다, 체크 시각은 유지", async () => {
    const listId = await defaultListId();
    const todo = await create({
      listId,
      title: "운동",
      dueDate: "2026-11-21",
      reminderAt: "2026-11-21T00:00:00.000Z",
      checklist: [{ title: "스트레칭", checked: true }],
    });
    const checkedAt = todo.checklist[0]!.checkedAt;
    clock = new Date("2026-11-20T05:00:00.000Z");

    const { data } = await call<TodoResponse>(
      me,
      "PATCH",
      `/todos/${todo.id}`,
      {
        importance: "high",
        reminderAt: null,
        checklist: [
          { id: todo.checklist[0]!.id, title: "스트레칭", checked: true },
          { title: "달리기", checked: false },
        ],
      },
    );
    expect(data.todo).toMatchObject({
      title: "운동",
      dueDate: "2026-11-21",
      importance: "high",
      reminderAt: null,
      updatedAt: clock.toISOString(),
    });
    expect(data.todo.checklist.map((c) => [c.title, c.checkedAt])).toEqual([
      ["스트레칭", checkedAt],
      ["달리기", null],
    ]);
  });

  test("없는 날짜·잘못된 반복은 400", async () => {
    const listId = await defaultListId();
    for (const body of [
      { listId, title: "x", dueDate: "2026-02-30" },
      { listId, title: "x", repeat: { type: "hourly", interval: 1 } },
      { listId, title: "x", repeat: { type: "daily", interval: 0 } },
      { listId, title: "" },
    ])
      expect((await call(me, "POST", "/todos", body)).status).toBe(400);
  });

  test("체크리스트 항목 하나만 체크·해제", async () => {
    const listId = await defaultListId();
    const todo = await create({
      listId,
      title: "짐 싸기",
      checklist: [{ title: "여권", checked: false }],
    });
    const itemId = todo.checklist[0]!.id;
    const path = `/todos/${todo.id}/checklist/${itemId}`;
    const checked = await call<{ item: Todo["checklist"][number] }>(
      me,
      "PATCH",
      path,
      { checked: true },
    );
    expect(checked.data.item.checkedAt).toBe(clock.toISOString());
    const unchecked = await call<{ item: Todo["checklist"][number] }>(
      me,
      "PATCH",
      path,
      { checked: false },
    );
    expect(unchecked.data.item.checkedAt).toBeNull();
  });
});

describe("완료", () => {
  test("완료하면 미완료에서 빠지고 완료됨에 최근 순으로, 되돌리면 돌아온다", async () => {
    const listId = await defaultListId();
    const a = await create({ listId, title: "A" });
    const b = await create({ listId, title: "B" });

    const done = await call<CompleteTodoResponse>(
      me,
      "POST",
      `/todos/${a.id}/complete`,
    );
    expect(done.data).toEqual({
      todo: expect.objectContaining({ completedAt: clock.toISOString() }),
      next: null,
    });
    clock = new Date("2026-11-20T01:00:00.000Z");
    await call(me, "POST", `/todos/${b.id}/complete`);

    const open = await call<TodosResponse>(me, "GET", "/todos");
    expect(open.data.todos).toEqual([]);
    const completed = await call<CompletedTodosResponse>(
      me,
      "GET",
      "/todos/completed",
    );
    expect(completed.data.todos.map((t) => t.title)).toEqual(["B", "A"]);

    const reopened = await call<TodoResponse>(
      me,
      "POST",
      `/todos/${a.id}/reopen`,
    );
    expect(reopened.data.todo.completedAt).toBeNull();
    expect(
      (await call<TodosResponse>(me, "GET", "/todos")).data.todos.map(
        (t) => t.title,
      ),
    ).toEqual(["A"]);
  });

  test("반복 할일은 다음 회차가 생기고, 완료한 쪽은 반복이 빠진다", async () => {
    const listId = await defaultListId();
    const todo = await create({
      listId,
      title: "월세",
      dueDate: "2026-01-31",
      reminderAt: "2026-01-31T00:00:00.000Z",
      repeat: { type: "monthly", interval: 1 },
      checklist: [{ title: "이체", checked: true }],
    });

    const { data } = await call<CompleteTodoResponse>(
      me,
      "POST",
      `/todos/${todo.id}/complete`,
    );
    expect(data.todo.repeat).toBeNull();
    expect(data.next).toMatchObject({
      title: "월세",
      dueDate: "2026-02-28",
      reminderAt: "2026-02-28T00:00:00.000Z",
      repeat: { type: "monthly", interval: 1 },
      completedAt: null,
    });
    expect(data.next!.checklist.map((c) => c.checkedAt)).toEqual([null]);

    // 다시 눌러도 회차가 또 생기지 않는다
    const again = await call<CompleteTodoResponse>(
      me,
      "POST",
      `/todos/${todo.id}/complete`,
    );
    expect(again.data.next).toBeNull();
    const open = await call<TodosResponse>(me, "GET", "/todos");
    expect(open.data.todos.map((t) => t.id)).toEqual([data.next!.id]);
  });
});
