import { beforeEach, describe, expect, test } from "bun:test";
import {
  extractMemoText,
  normalizeMemoValues,
  type MemoProperty,
  type MemoPropertyResponse,
  type MemoResponse,
  type MemosResponse,
} from "@cali/shared";
import { createApp } from "../app";
import { createMemoryAuthStore } from "../auth/memory-store";
import { startSession } from "../auth/session";
import { createMemoryTodoStore } from "../todos/memory-store";
import { createMemoryMemoStore } from "./memory-store";

let app: ReturnType<typeof createApp>;
let clock: Date;
let me: string;
let other: string;

beforeEach(async () => {
  const auth = createMemoryAuthStore();
  clock = new Date("2026-11-23T00:00:00.000Z");
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
    memos: { store: createMemoryMemoStore() },
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

const paragraph = (text: string) => ({
  type: "paragraph",
  props: {},
  content: [{ type: "text", text, styles: {} }],
  children: [],
});

async function addProperty(body: unknown, token = me) {
  const res = await call<MemoPropertyResponse>(
    token,
    "POST",
    "/memo-properties",
    body,
  );
  expect(res.status).toBe(201);
  return res.data.property;
}

async function addMemo(body: unknown, token = me) {
  const res = await call<MemoResponse>(token, "POST", "/memos", body);
  expect(res.status).toBe(201);
  return res.data.memo;
}

const list = async (token = me, q?: string) =>
  (
    await call<MemosResponse>(
      token,
      "GET",
      q === undefined ? "/memos" : `/memos?q=${encodeURIComponent(q)}`,
    )
  ).data;

describe("메모", () => {
  test("로그인 없이는 401", async () => {
    expect((await app.request("/memos")).status).toBe(401);
  });

  test("빈 메모를 만들고, 본문에서 미리보기를 뽑는다", async () => {
    const empty = await addMemo({});
    expect(empty).toMatchObject({ title: "", content: [], values: {} });
    const memo = await addMemo({
      title: "  회의  ",
      content: [paragraph("첫 줄"), paragraph("둘째 줄")],
    });
    expect(memo.title).toBe("회의");
  });

  test("목록은 최근에 고친 순, 본문 JSON은 없다", async () => {
    const a = await addMemo({ title: "a" });
    clock = new Date("2026-11-23T01:00:00.000Z");
    await addMemo({ title: "b" });
    clock = new Date("2026-11-23T02:00:00.000Z");
    await call(me, "PATCH", `/memos/${a.id}`, { title: "a2" });
    const { memos } = await list();
    expect(memos.map((m) => m.title)).toEqual(["a2", "b"]);
    expect("content" in memos[0]!).toBe(false);
  });

  test("PATCH는 보낸 칸만 바꾼다", async () => {
    const memo = await addMemo({ title: "제목", content: [paragraph("본문")] });
    const { data } = await call<MemoResponse>(
      me,
      "PATCH",
      `/memos/${memo.id}`,
      {
        title: "새 제목",
      },
    );
    expect(data.memo.title).toBe("새 제목");
    expect(data.memo.content).toEqual([paragraph("본문")]);
  });

  test("검색은 제목·본문, 대소문자 무시, %는 글자 그대로", async () => {
    await addMemo({ title: "Weekly 회의" });
    await addMemo({ title: "장보기", content: [paragraph("우유 100% 두유")] });
    await addMemo({ title: "기타" });
    expect((await list(me, "weekly")).memos.map((m) => m.title)).toEqual([
      "Weekly 회의",
    ]);
    expect((await list(me, "우유")).memos.map((m) => m.title)).toEqual([
      "장보기",
    ]);
    expect((await list(me, "100%")).memos).toHaveLength(1);
    expect((await list(me, "  ")).memos).toHaveLength(3);
  });

  test("남의 메모는 없는 것처럼", async () => {
    const memo = await addMemo({ title: "내 것" });
    expect((await call(other, "GET", `/memos/${memo.id}`)).status).toBe(404);
    expect(
      (await call(other, "PATCH", `/memos/${memo.id}`, { title: "x" })).status,
    ).toBe(404);
    expect((await call(other, "DELETE", `/memos/${memo.id}`)).status).toBe(404);
    expect((await list(other)).memos).toEqual([]);
    expect((await call(me, "DELETE", `/memos/${memo.id}`)).status).toBe(204);
    expect((await list()).memos).toEqual([]);
  });

  test("본문이 배열이 아니면 400", async () => {
    expect(
      (await call(me, "POST", "/memos", { content: { type: "x" } })).status,
    ).toBe(400);
  });
});

describe("속성", () => {
  test("선택지는 선택 종류에만 남는다", async () => {
    const text = await addProperty({
      name: "출처",
      type: "text",
      options: [{ id: "a", name: "A", color: "red" }],
    });
    expect(text.options).toEqual([]);
    const select = await addProperty({
      name: "분류",
      type: "select",
      options: [{ id: "work", name: "업무", color: "blue" }],
    });
    expect(select.options).toHaveLength(1);
    expect((await list()).properties.map((p) => p.name)).toEqual([
      "출처",
      "분류",
    ]);
  });

  test("같은 선택지 id 두 번이면 400", async () => {
    const res = await call(me, "POST", "/memo-properties", {
      name: "x",
      type: "select",
      options: [
        { id: "a", name: "A", color: "red" },
        { id: "a", name: "B", color: "red" },
      ],
    });
    expect(res.status).toBe(400);
  });

  test("메모 값은 정의에 맞춰 저장되고, 지운 선택지·속성의 값은 안 보인다", async () => {
    const kind = await addProperty({
      name: "분류",
      type: "select",
      options: [
        { id: "work", name: "업무", color: "blue" },
        { id: "home", name: "집", color: "green" },
      ],
    });
    const done = await addProperty({ name: "끝남", type: "checkbox" });
    const memo = await addMemo({
      values: {
        [kind.id]: "work",
        [done.id]: true,
        "999": "없는 속성",
      },
    });
    expect(memo.values).toEqual({ [kind.id]: "work", [done.id]: true });

    // 선택지 "work"를 지우면 그 값은 안 보인다
    await call(me, "PATCH", `/memo-properties/${kind.id}`, {
      options: [{ id: "home", name: "집", color: "green" }],
    });
    // 속성 "끝남"을 지우면 그 값도
    expect(
      (await call(me, "DELETE", `/memo-properties/${done.id}`)).status,
    ).toBe(204);
    const { data } = await call<MemoResponse>(me, "GET", `/memos/${memo.id}`);
    expect(data.memo.values).toEqual({});
    expect((await list()).memos[0]!.values).toEqual({});
  });

  test("이름만 고치면 선택지는 그대로, 남의 속성은 404", async () => {
    const p = await addProperty({
      name: "분류",
      type: "select",
      options: [{ id: "a", name: "A", color: "red" }],
    });
    const { data } = await call<MemoPropertyResponse>(
      me,
      "PATCH",
      `/memo-properties/${p.id}`,
      { name: "종류" },
    );
    expect(data.property).toMatchObject({ name: "종류", type: "select" });
    expect(data.property.options).toHaveLength(1);
    expect(
      (await call(other, "PATCH", `/memo-properties/${p.id}`, { name: "x" }))
        .status,
    ).toBe(404);
    expect(
      (await call(other, "DELETE", `/memo-properties/${p.id}`)).status,
    ).toBe(404);
    expect((await list(other)).properties).toEqual([]);
  });
});

describe("normalizeMemoValues", () => {
  const props: MemoProperty[] = [
    { id: 1, name: "글", type: "text", options: [] },
    { id: 2, name: "수", type: "number", options: [] },
    { id: 3, name: "날", type: "date", options: [] },
    { id: 4, name: "체크", type: "checkbox", options: [] },
    {
      id: 5,
      name: "태그",
      type: "multiSelect",
      options: [
        { id: "a", name: "A", color: "red" },
        { id: "b", name: "B", color: "blue" },
      ],
    },
    { id: 6, name: "링크", type: "url", options: [] },
  ];

  test("종류가 맞는 값만, 빈 값은 버린다", () => {
    expect(
      normalizeMemoValues(props, {
        1: "  글  ",
        2: 3.5,
        3: "2026-11-23",
        4: true,
        5: ["b", "x", "a", "b"],
        6: "",
      }),
    ).toEqual({ 1: "글", 2: 3.5, 3: "2026-11-23", 4: true, 5: ["a", "b"] });
    expect(
      normalizeMemoValues(props, {
        1: 1,
        2: "3",
        3: "11/23",
        4: false,
        5: [],
      }),
    ).toEqual({});
    expect(normalizeMemoValues(props, null)).toEqual({});
    expect(normalizeMemoValues(props, ["x"])).toEqual({});
  });
});

describe("extractMemoText", () => {
  test("블록마다 한 줄, 하위 블록·링크·표 글자까지", () => {
    const blocks = [
      {
        type: "heading",
        content: [
          { type: "text", text: "제목", styles: {} },
          {
            type: "link",
            href: "https://x",
            content: [{ type: "text", text: " 링크", styles: {} }],
          },
        ],
        children: [paragraph("하위")],
      },
      { type: "paragraph", content: [], children: [] },
      {
        type: "table",
        content: {
          type: "tableContent",
          rows: [
            {
              cells: [
                [{ type: "text", text: "가", styles: {} }],
                {
                  type: "tableCell",
                  content: [{ type: "text", text: "나", styles: {} }],
                },
              ],
            },
          ],
        },
        children: [],
      },
    ];
    expect(extractMemoText(blocks)).toBe("제목 링크\n하위\n가 나");
  });

  test("모양이 이상해도 던지지 않는다", () => {
    expect(extractMemoText([null, 1, "x", { content: 3 }])).toBe("");
    expect(extractMemoText({})).toBe("");
  });
});
