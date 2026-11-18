import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiRequestError, API_URL } from "./api";

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("로그인은 id_token을 JSON으로 보내고 세션을 받는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { token: "t", user: { id: 1, email: "a@b.c", name: null, pictureUrl: null } }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await api.loginWithGoogle("id-token");

    expect(res.token).toBe("t");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API_URL}/auth/google`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ idToken: "id-token" });
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("세션 토큰은 Authorization: Bearer로 보낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { user: { id: 1, email: "a@b.c", name: null, pictureUrl: null } }));
    vi.stubGlobal("fetch", fetchMock);

    await api.me("session-token");

    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe("Bearer session-token");
  });

  it("실패하면 상태 코드와 서버 오류 코드를 담아 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, { error: "unauthorized" })));

    const err = await api.me("x").catch((e) => e);

    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(401);
    expect(err.code).toBe("unauthorized");
  });

  it("204 응답은 본문 없이 끝난다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api.logout("x")).resolves.toBeUndefined();
  });
});
