// Cali 서버(apps/server) 호출의 단일 진입점. 요청·응답 형식은 @cali/shared.
import type { ApiError, LoginResponse, MeResponse } from "@cali/shared";

/** 개발(bun run dev:tauri)은 로컬 서버(bun run dev:server), 배포 빌드는 운영. VITE_API_URL로 바꿀 수 있다 */
export const API_URL = (
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:8787" : "https://cali-api.jinu.io")
).replace(/\/+$/, "");

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code?: ApiError["error"],
  ) {
    super(code ? `서버 오류 ${status} (${code})` : `서버 오류 ${status}`);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(res.status, body?.error);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  /** Google OAuth 교환 응답의 id_token으로 서버 세션을 받는다 */
  loginWithGoogle: (idToken: string) =>
    request<LoginResponse>("/auth/google", { method: "POST", body: JSON.stringify({ idToken }) }),
  me: (token: string) => request<MeResponse>("/me", { token }),
  logout: (token: string) => request<void>("/auth/logout", { method: "POST", token }),
};
