import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRoutes, type AuthDeps } from "./auth/routes";
import { memoRoutes, type MemoDeps } from "./memos/routes";
import { placeRoutes, type PlaceDeps } from "./places/routes";
import { todoRoutes, type TodoDeps } from "./todos/routes";

export interface AppDeps {
  corsOrigins: string[];
  /** DB에 닿는지 확인. 실패하면 throw */
  checkDb: () => Promise<void>;
  auth: AuthDeps;
  todos: TodoDeps;
  memos: MemoDeps;
  /** 장소 검색. 없으면 /places가 503 */
  places?: PlaceDeps;
}

export function createApp(deps: AppDeps) {
  return new Hono()
    .use(
      "*",
      cors({
        origin: deps.corsOrigins,
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        allowHeaders: ["Authorization", "Content-Type"],
        maxAge: 600,
      }),
    )
    .get("/health", async (c) => {
      try {
        await deps.checkDb();
        return c.json({ ok: true });
      } catch (err) {
        console.error("[health] DB 확인 실패", err);
        return c.json({ ok: false }, 503);
      }
    })
    .route("/", authRoutes(deps.auth))
    .route("/", todoRoutes(deps.auth, deps.todos))
    .route("/", memoRoutes(deps.auth, deps.memos))
    .route("/", placeRoutes(deps.auth, deps.places ?? {}));
}
