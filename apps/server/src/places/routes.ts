import {
  PLACE_QUERY_MAX,
  type ApiError,
  type PlaceResult,
  type PlacesResponse,
} from "@cali/shared";
import { Hono } from "hono";
import { requireUser, type AuthDeps } from "../auth/routes";

export interface PlaceDeps {
  /** 네이버 지역검색. 없으면(서버에 키가 없음) 503 */
  search?: (query: string) => Promise<PlaceResult[]>;
  /** 사용자마다 하루(한국 날짜) 검색 횟수. 가입은 누구나 되니 한 사람이 호출량을 다 쓰지 못하게 */
  dailyLimit?: number;
  now?: () => Date;
}

const DEFAULT_DAILY_LIMIT = 300;
/** 같은 검색어는 잠깐 기억해 네이버까지 가지 않는다(가게 주소는 자주 안 바뀐다) */
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 1000;

/** 한국 날짜(YYYY-MM-DD). 네이버 한도도 한국 자정에 초기화된다 */
const kstDay = (d: Date) =>
  new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

export function placeRoutes(auth: AuthDeps, deps: PlaceDeps) {
  const now = deps.now ?? (() => new Date());
  const dailyLimit = deps.dailyLimit ?? DEFAULT_DAILY_LIMIT;
  const used = new Map<number, { day: string; count: number }>();
  const cache = new Map<string, { at: number; places: PlaceResult[] }>();

  /** 한도 안이면 하나 세고 true */
  const take = (userId: number) => {
    const day = kstDay(now());
    const u = used.get(userId);
    const count = u?.day === day ? u.count : 0;
    if (count >= dailyLimit) return false;
    used.set(userId, { day, count: count + 1 });
    return true;
  };

  return new Hono().get("/places", requireUser(auth), async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (!q || q.length > PLACE_QUERY_MAX)
      return c.json<ApiError>({ error: "invalid_body" }, 400);

    const key = q.toLowerCase();
    const hit = cache.get(key);
    if (hit && now().getTime() - hit.at < CACHE_TTL_MS)
      return c.json<PlacesResponse>({ places: hit.places });

    if (!deps.search) return c.json<ApiError>({ error: "unavailable" }, 503);
    if (!take(c.get("user").id))
      return c.json<ApiError>({ error: "rate_limited" }, 429);

    let places: PlaceResult[];
    try {
      places = await deps.search(q);
    } catch (err) {
      console.warn("[places] 네이버 검색 실패", err);
      return c.json<ApiError>({ error: "upstream_error" }, 502);
    }

    cache.delete(key);
    cache.set(key, { at: now().getTime(), places });
    // Map은 넣은 순서를 지키므로 맨 앞이 가장 오래된 것
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
    return c.json<PlacesResponse>({ places });
  });
}
