import {
  createMemoBody,
  createMemoPropertyBody,
  extractMemoText,
  normalizeMemoValues,
  updateMemoBody,
  updateMemoPropertyBody,
  type ApiError,
  type Memo,
  type MemoProperty,
  type MemoPropertyResponse,
  type MemoPropertyType,
  type MemoResponse,
  type MemosResponse,
} from "@cali/shared";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { z } from "zod";
import { requireUser, type AuthDeps } from "../auth/routes";
import type { MemoInput, MemoStore } from "./store";

export interface MemoDeps {
  store: MemoStore;
}

/** 본문 JSON까지 한 번에 받으므로 다른 API보다 넉넉히, 그래도 끝은 있게 */
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_QUERY_LENGTH = 200;
const MAX_PROPERTIES = 50;

const hasOptions = (type: MemoPropertyType) =>
  type === "select" || type === "multiSelect";

const idParam = (s: string) => {
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

async function parseBody<T extends z.ZodType>(c: Context, schema: T) {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  return parsed.success ? (parsed.data as z.infer<T>) : null;
}

/** 응답의 속성 값은 지금 속성 정의로 거른다(지운 속성·선택지가 남아 보이지 않게) */
const withValues = <T extends { values: unknown }>(
  properties: MemoProperty[],
  memo: T,
): T => ({ ...memo, values: normalizeMemoValues(properties, memo.values) });

export function memoRoutes(authDeps: AuthDeps, deps: MemoDeps) {
  const now = authDeps.now ?? (() => new Date());
  const auth = requireUser(authDeps);
  const { store } = deps;
  const limit = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json<ApiError>({ error: "invalid_body" }, 413),
  });

  const notFound = (c: Context) =>
    c.json<ApiError>({ error: "not_found" }, 404);
  const invalid = (c: Context) =>
    c.json<ApiError>({ error: "invalid_body" }, 400);

  /** 보낸 칸을 기존 메모에 합쳐 통째로 쓸 값으로 */
  const toInput = (
    properties: MemoProperty[],
    body: z.infer<typeof updateMemoBody>,
    current?: Memo,
  ): MemoInput => {
    const content = body.content ?? current?.content ?? [];
    return {
      title: (body.title ?? current?.title ?? "").trim(),
      content,
      contentText: extractMemoText(content),
      values: normalizeMemoValues(
        properties,
        body.values ?? current?.values ?? {},
      ),
    };
  };

  return (
    new Hono()
      // 속성 ----------------------------------------------------------------
      .post("/memo-properties", auth, async (c) => {
        const userId = c.get("user").id;
        const body = await parseBody(c, createMemoPropertyBody);
        if (!body) return invalid(c);
        if ((await store.properties(userId)).length >= MAX_PROPERTIES)
          return invalid(c);
        const property = await store.createProperty(
          userId,
          {
            name: body.name,
            type: body.type,
            options: hasOptions(body.type) ? (body.options ?? []) : [],
          },
          now(),
        );
        return c.json<MemoPropertyResponse>({ property }, 201);
      })
      .patch("/memo-properties/:id", auth, async (c) => {
        const userId = c.get("user").id;
        const id = idParam(c.req.param("id"));
        const body = await parseBody(c, updateMemoPropertyBody);
        if (!id) return notFound(c);
        if (!body) return invalid(c);
        const current = (await store.properties(userId)).find(
          (p) => p.id === id,
        );
        if (!current) return notFound(c);
        const property = await store.updateProperty(userId, id, {
          name: body.name ?? current.name,
          options: hasOptions(current.type)
            ? (body.options ?? current.options)
            : [],
        });
        return property
          ? c.json<MemoPropertyResponse>({ property })
          : notFound(c);
      })
      .delete("/memo-properties/:id", auth, async (c) => {
        const id = idParam(c.req.param("id"));
        // 메모에 남은 값은 지우지 않는다 — 읽을 때 거르고, 다음에 저장하면 빠진다
        if (!id || !(await store.deleteProperty(c.get("user").id, id)))
          return notFound(c);
        return c.body(null, 204);
      })

      // 메모 ----------------------------------------------------------------
      .get("/memos", auth, async (c) => {
        const userId = c.get("user").id;
        const q = c.req.query("q")?.trim().slice(0, MAX_QUERY_LENGTH);
        const [properties, memos] = await Promise.all([
          store.properties(userId),
          store.memos(userId, q || undefined),
        ]);
        return c.json<MemosResponse>({
          properties,
          memos: memos.map((m) => withValues(properties, m)),
        });
      })
      .get("/memos/:id", auth, async (c) => {
        const userId = c.get("user").id;
        const id = idParam(c.req.param("id"));
        const memo = id ? await store.findMemo(userId, id) : null;
        if (!memo) return notFound(c);
        const properties = await store.properties(userId);
        return c.json<MemoResponse>({ memo: withValues(properties, memo) });
      })
      .post("/memos", auth, limit, async (c) => {
        const userId = c.get("user").id;
        const body = await parseBody(c, createMemoBody);
        if (!body) return invalid(c);
        const properties = await store.properties(userId);
        const memo = await store.insertMemo(
          userId,
          toInput(properties, body),
          now(),
        );
        return c.json<MemoResponse>({ memo }, 201);
      })
      .patch("/memos/:id", auth, limit, async (c) => {
        const userId = c.get("user").id;
        const id = idParam(c.req.param("id"));
        const body = await parseBody(c, updateMemoBody);
        if (!id) return notFound(c);
        if (!body) return invalid(c);
        const current = await store.findMemo(userId, id);
        if (!current) return notFound(c);
        const properties = await store.properties(userId);
        const memo = await store.replaceMemo(
          userId,
          id,
          toInput(properties, body, current),
          now(),
        );
        return memo ? c.json<MemoResponse>({ memo }) : notFound(c);
      })
      .delete("/memos/:id", auth, async (c) => {
        const id = idParam(c.req.param("id"));
        if (!id || !(await store.deleteMemo(c.get("user").id, id)))
          return notFound(c);
        return c.body(null, 204);
      })
  );
}
