import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { LoginResponse, MeResponse } from "@cali/shared";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWTPayload,
} from "jose";
import { createApp } from "../app";
import { createGoogleVerifier } from "./google";
import { createMemoryTodoStore } from "../todos/memory-store";
import { createMemoryAuthStore } from "./memory-store";
import { SESSION_TTL_MS, hashToken } from "./session";
import { createMemoryMemoStore } from "../memos/memory-store";

const CLIENT_ID = "desktop-client.apps.googleusercontent.com";
const KID = "test-key";

let googleKey: CryptoKey;
let otherKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const google = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  googleKey = google.privateKey;
  otherKey = other.privateKey;
  const jwk = {
    ...(await exportJWK(google.publicKey)),
    kid: KID,
    alg: "RS256",
    use: "sig",
  };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

/** Google이 발급한 것처럼 서명한 id_token */
async function idToken(
  overrides: JWTPayload = {},
  opts: { key?: CryptoKey; expiresIn?: string } = {},
) {
  return new SignJWT({
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "google-sub-1",
    email: "me@example.com",
    email_verified: true,
    name: "진우",
    picture: "https://lh3.googleusercontent.com/a/x",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "1h")
    .sign(opts.key ?? googleKey);
}

let store: ReturnType<typeof createMemoryAuthStore>;
let clock: Date;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = createMemoryAuthStore();
  clock = new Date();
  app = createApp({
    corsOrigins: [],
    checkDb: async () => {},
    auth: {
      store,
      verifyGoogle: createGoogleVerifier({
        audiences: [CLIENT_ID, "android-client"],
        jwks,
      }),
      now: () => clock,
    },
    todos: { store: createMemoryTodoStore() },
    memos: { store: createMemoryMemoStore() },
  });
});

const login = (token: string) =>
  app.request("/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }),
  });

const me = (session?: string) =>
  app.request("/me", {
    headers: session ? { Authorization: `Bearer ${session}` } : {},
  });

describe("POST /auth/google", () => {
  test("올바른 id_token이면 사용자를 만들고 세션 토큰을 준다", async () => {
    const res = await login(await idToken());
    expect(res.status).toBe(200);
    const body = (await res.json()) as LoginResponse;
    expect(body.user).toEqual({
      id: 1,
      email: "me@example.com",
      name: "진우",
      pictureUrl: "https://lh3.googleusercontent.com/a/x",
    });
    expect(body.token.length).toBeGreaterThanOrEqual(43);
    // DB에는 토큰 원문이 아니라 해시만
    expect(store.sessions.has(body.token)).toBe(false);
    expect(store.sessions.has(hashToken(body.token))).toBe(true);
  });

  test("같은 Google 계정이면 같은 사용자, 바뀐 이메일·이름은 따라간다", async () => {
    await login(await idToken());
    const res = await login(
      await idToken({ email: "new@example.com", name: "새 이름" }),
    );
    const body = (await res.json()) as LoginResponse;
    expect(body.user.id).toBe(1);
    expect(body.user.email).toBe("new@example.com");
    expect(store.users.size).toBe(1);
  });

  test("다른 aud(남의 OAuth 클라이언트)용 토큰은 거부", async () => {
    expect((await login(await idToken({ aud: "someone-else" }))).status).toBe(
      401,
    );
  });

  test("허용 목록의 다른 클라이언트(안드로이드)는 받는다", async () => {
    expect((await login(await idToken({ aud: "android-client" }))).status).toBe(
      200,
    );
  });

  test("Google 키가 아닌 키로 서명하면 거부", async () => {
    expect((await login(await idToken({}, { key: otherKey }))).status).toBe(
      401,
    );
  });

  test("만료된 토큰은 거부", async () => {
    expect((await login(await idToken({}, { expiresIn: "-5m" }))).status).toBe(
      401,
    );
  });

  test("발급자가 Google이 아니면 거부", async () => {
    expect(
      (await login(await idToken({ iss: "https://evil.example" }))).status,
    ).toBe(401);
  });

  test("이메일이 확인되지 않았으면 거부", async () => {
    expect((await login(await idToken({ email_verified: false }))).status).toBe(
      401,
    );
  });

  test("본문이 틀리면 400", async () => {
    const res = await app.request("/auth/google", {
      method: "POST",
      body: "not json",
    });
    expect(res.status).toBe(400);
    expect(store.users.size).toBe(0);
  });
});

describe("세션", () => {
  async function signIn() {
    return ((await (await login(await idToken())).json()) as LoginResponse)
      .token;
  }

  test("/me는 세션 토큰이 있어야 한다", async () => {
    const token = await signIn();
    const ok = await me(token);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as MeResponse).user.email).toBe("me@example.com");
    expect((await me()).status).toBe(401);
    expect((await me("garbage")).status).toBe(401);
  });

  test("로그아웃하면 그 토큰은 더 못 쓴다", async () => {
    const token = await signIn();
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(204);
    expect((await me(token)).status).toBe(401);
  });

  test("오래 안 쓰면 만료, 쓰면 만료가 밀린다", async () => {
    const token = await signIn();
    const start = clock.getTime();

    // 80일 뒤 사용 → 만료가 그때부터 90일로 밀림
    clock = new Date(start + 80 * 24 * 3600 * 1000);
    expect((await me(token)).status).toBe(200);

    // 처음 기준으론 만료(90일)를 넘었지만 연장돼서 통과
    clock = new Date(start + 100 * 24 * 3600 * 1000);
    expect((await me(token)).status).toBe(200);

    // 마지막 사용에서 90일 넘게 지나면 만료
    clock = new Date(clock.getTime() + SESSION_TTL_MS + 1000);
    expect((await me(token)).status).toBe(401);
  });
});
