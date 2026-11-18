/**
 * 인증 fetch 공통 골격.
 *
 * google-calendar.ts(`request`)와 microsoft-todo.ts(`graphFetch`)가 공유하던
 * "사전 토큰 갱신 → fetch → 401 시 강제 갱신 후 1회 재시도 → 에러 처리 → 204 처리"
 * 흐름을 통합한다. provider별 차이(Content-Type 조건, 429 메시지, 204 반환값,
 * 비-OK 응답 파싱)는 옵션/콜백으로 주입한다.
 */
import { RateLimitError } from "./api-errors";

interface AuthenticatedFetchConfig {
  /** API 베이스 URL (path가 이어붙는다) */
  baseUrl: string;
  /** 토큰 갱신. force=true면 만료 여부와 무관하게 강제 갱신 */
  refresh: (force?: boolean) => Promise<{ access_token: string } | null>;
  /** Content-Type: application/json 부착 시점 ("always" | "write"=쓰기 요청만) */
  jsonContentType: "always" | "write";
  /** 204(No Content) 응답 시 반환값 */
  emptyValue: unknown;
  /** 429 발생 시 RateLimitError에 담을 메시지 */
  rateLimitMessage: string;
  /** 429 외 비-OK 응답을 에러로 변환 */
  parseError: (res: Response) => Promise<Error>;
}

export function createAuthenticatedFetch(config: AuthenticatedFetchConfig) {
  return async function authenticatedFetch<T>(
    path: string,
    accessToken: string,
    options: RequestInit = {}
  ): Promise<T> {
    const isWrite = !!options.method && options.method !== "GET";
    const needsJson = config.jsonContentType === "always" || isWrite;

    const token = (await config.refresh())?.access_token ?? accessToken;
    const res = await fetch(`${config.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(needsJson ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
    });

    if (res.status === 401) {
      const refreshed = await config.refresh(true);
      if (refreshed?.access_token && refreshed.access_token !== token) {
        return authenticatedFetch<T>(path, refreshed.access_token, options);
      }
    }

    if (!res.ok) {
      if (res.status === 429) {
        const retry = parseInt(res.headers.get("Retry-After") ?? "60", 10);
        throw new RateLimitError(retry, config.rateLimitMessage);
      }
      throw await config.parseError(res);
    }

    if (res.status === 204) return config.emptyValue as T;
    return res.json() as Promise<T>;
  };
}
