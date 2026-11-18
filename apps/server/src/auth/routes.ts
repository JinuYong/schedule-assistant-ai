import { googleLoginBody, type ApiError, type LoginResponse, type MeResponse, type PublicUser } from "@cali/shared";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { User } from "../db/schema";
import { InvalidIdTokenError, type VerifyGoogleIdToken } from "./google";
import { endSession, resolveSession, startSession } from "./session";
import type { AuthStore } from "./store";

export interface AuthDeps {
  store: AuthStore;
  verifyGoogle: VerifyGoogleIdToken;
  /** 테스트에서 시각을 고정한다 */
  now?: () => Date;
}

type AuthVars = { Variables: { user: User; token: string } };

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  pictureUrl: u.pictureUrl,
});

const bearer = (header: string | undefined) => {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  return m?.[1] ?? null;
};

/** Authorization: Bearer <세션 토큰>이 맞아야 통과. c.get("user")로 사용자를 꺼낸다 */
export function requireUser(deps: AuthDeps) {
  const now = deps.now ?? (() => new Date());
  return createMiddleware<AuthVars>(async (c, next) => {
    const token = bearer(c.req.header("Authorization"));
    const user = token ? await resolveSession(deps.store, token, now()) : null;
    if (!token || !user) return c.json<ApiError>({ error: "unauthorized" }, 401);
    c.set("user", user);
    c.set("token", token);
    await next();
  });
}

export function authRoutes(deps: AuthDeps) {
  const now = deps.now ?? (() => new Date());
  const auth = requireUser(deps);

  return new Hono<AuthVars>()
    .post("/auth/google", async (c) => {
      const body = googleLoginBody.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json<ApiError>({ error: "invalid_body" }, 400);

      let profile;
      try {
        profile = await deps.verifyGoogle(body.data.idToken);
      } catch (err) {
        if (err instanceof InvalidIdTokenError) {
          console.warn("[auth] id_token 거부:", err.message);
          return c.json<ApiError>({ error: "invalid_token" }, 401);
        }
        throw err;
      }

      const at = now();
      const user = await deps.store.upsertGoogleUser(profile, at);
      const token = await startSession(deps.store, user.id, at);
      return c.json<LoginResponse>({ token, user: toPublicUser(user) });
    })
    .get("/me", auth, (c) => c.json<MeResponse>({ user: toPublicUser(c.get("user")) }))
    .post("/auth/logout", auth, async (c) => {
      await endSession(deps.store, c.get("token"));
      return c.body(null, 204);
    });
}
