import { describe, expect, test } from "bun:test";
import { createApp, type AppDeps } from "./app";
import { createMemoryAuthStore } from "./auth/memory-store";
import { createMemoryTodoStore } from "./todos/memory-store";

const ORIGINS = ["tauri://localhost", "http://localhost:3100"];
const auth: AppDeps["auth"] = {
  store: createMemoryAuthStore(),
  verifyGoogle: async () => {
    throw new Error("이 테스트에서는 부르지 않는다");
  },
};

describe("/health", () => {
  test("DB에 닿으면 200", async () => {
    const app = createApp({
      corsOrigins: ORIGINS,
      checkDb: async () => {},
      auth,
      todos: { store: createMemoryTodoStore() },
    });
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("DB 확인이 실패하면 503", async () => {
    const app = createApp({
      corsOrigins: ORIGINS,
      checkDb: async () => {
        throw new Error("down");
      },
      auth,
      todos: { store: createMemoryTodoStore() },
    });
    const res = await app.request("/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});

describe("CORS", () => {
  const app = createApp({
    corsOrigins: ORIGINS,
    checkDb: async () => {},
    auth,
    todos: { store: createMemoryTodoStore() },
  });

  test("Tauri 창 출처는 허용", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "tauri://localhost" },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "tauri://localhost",
    );
  });

  test("모르는 출처는 허용 헤더를 주지 않는다", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "https://evil.example" },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  test("미리 보내는 요청(preflight)에 Authorization 헤더를 허용", async () => {
    const res = await app.request("/health", {
      method: "OPTIONS",
      headers: {
        Origin: "tauri://localhost",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    );
  });
});
