import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauri-store";
import { AuthError } from "./api-errors";
import type { BaseTokens } from "@/types/tokens";

// 빌드 시 번들된 OAuth credentials (개발자가 .env.local에 설정)
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET ?? "";
const MICROSOFT_CLIENT_ID = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID ?? "";
const MICROSOFT_CLIENT_SECRET = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_SECRET ?? "";

/** Rust refresh 커맨드 응답 형태 */
interface RefreshResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
}

/**
 * 응답 scope에서 필수 권한 중 빠진 것을 찾는다.
 *
 * Google 동의 화면은 캘린더 같은 민감한 범위를 사용자가 개별적으로 해제할 수 있고,
 * 그래도 토큰은 정상 발급된다. 그래서 요청한 스코프가 아니라 **승인된 스코프**를 봐야 한다.
 *
 * 스코프 표기가 provider마다 달라("Tasks.ReadWrite" vs "https://graph.microsoft.com/Tasks.ReadWrite")
 * 마지막 경로 세그먼트를 소문자로 맞춰 비교한다.
 *
 * `granted`가 비어 있으면 판별할 근거가 없으므로 통과시킨다 —
 * 응답에 scope가 없다는 이유로 로그인을 막으면 오탐이 더 치명적이다.
 */
export function findMissingScopes(granted: string | undefined, required: string[]): string[] {
  if (!granted?.trim()) return [];
  const tail = (scope: string) => scope.split("/").pop()?.toLowerCase() ?? "";
  const grantedTails = new Set(granted.trim().split(/\s+/).map(tail));
  return required.filter((scope) => !grantedTails.has(tail(scope)));
}

/** provider별 OAuth 설정 (exchange/refresh 커맨드, 인증 URL, invoke 인자) */
interface OAuthProvider {
  clientId: string;
  /** Client ID 미설정 시 안내 메시지 */
  missingIdError: string;
  exchangeCommand: string;
  refreshCommand: string;
  buildAuthUrl: (port: number) => string;
  exchangeArgs: (code: string, port: number) => Record<string, unknown>;
  refreshArgs: (refreshToken: string) => Record<string, unknown>;
  /** 이게 없으면 앱의 핵심 기능이 동작하지 않는 스코프 */
  requiredScopes: string[];
  /** 필수 스코프 누락 시 사용자에게 보일 안내 */
  missingScopeError: string;
}

const redirectUri = (port: number) => `http://localhost:${port}`;

const googleProvider: OAuthProvider = {
  clientId: GOOGLE_CLIENT_ID,
  missingIdError: "Google Client ID가 설정되지 않았습니다. 개발자에게 문의하세요.",
  exchangeCommand: "exchange_google_token",
  refreshCommand: "refresh_google_token",
  buildAuthUrl: (port) =>
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri(port))}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent("https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email")}` +
    `&access_type=offline` +
    `&prompt=consent`,
  exchangeArgs: (code, port) => ({
    code,
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: redirectUri(port),
  }),
  refreshArgs: (refreshToken) => ({
    refreshToken,
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
  }),
  requiredScopes: ["https://www.googleapis.com/auth/calendar"],
  missingScopeError:
    "캘린더 접근 권한이 없어 연결하지 못했습니다. 다시 로그인한 뒤 동의 화면에서 캘린더 관련 항목을 모두 체크해 주세요.",
};

const microsoftProvider: OAuthProvider = {
  clientId: MICROSOFT_CLIENT_ID,
  missingIdError: "Microsoft Client ID가 설정되지 않았습니다. 개발자에게 문의하세요.",
  exchangeCommand: "exchange_microsoft_token",
  refreshCommand: "refresh_microsoft_token",
  buildAuthUrl: (port) =>
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` +
    `?client_id=${encodeURIComponent(MICROSOFT_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri(port))}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent("Tasks.ReadWrite offline_access User.Read")}` +
    `&response_mode=query`,
  exchangeArgs: (code, port) => ({
    code,
    clientId: MICROSOFT_CLIENT_ID,
    clientSecret: MICROSOFT_CLIENT_SECRET,
    redirectUri: redirectUri(port),
    tenant: "common",
  }),
  refreshArgs: (refreshToken) => ({
    refreshToken,
    clientId: MICROSOFT_CLIENT_ID,
    clientSecret: MICROSOFT_CLIENT_SECRET,
    tenant: "common",
  }),
  requiredScopes: ["Tasks.ReadWrite"],
  missingScopeError:
    "할일 접근 권한이 없어 연결하지 못했습니다. 다시 로그인한 뒤 동의 화면에서 할일 관련 항목을 체크해 주세요.",
};

/** 로컬 OAuth 서버 시작 → 시스템 브라우저 인증 → code 교환 공통 흐름 */
async function startOAuth(
  provider: OAuthProvider,
  onTokens: (tokens: BaseTokens) => void,
  onError: (err: string) => void
): Promise<void> {
  if (!isTauri()) {
    onError("Tauri 환경이 아닙니다.");
    return;
  }

  if (!provider.clientId) {
    onError(provider.missingIdError);
    return;
  }

  try {
    const { start, onUrl, cancel } = await import("@fabianlars/tauri-plugin-oauth");
    const { open } = await import("@tauri-apps/plugin-shell");

    const port = await start();

    const unlisten = await onUrl(async (callbackUrl: string) => {
      unlisten();
      try { await cancel(port); } catch { /* 이미 종료된 경우 무시 */ }

      const url = new URL(callbackUrl);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error || !code) {
        onError(error ?? "인증 코드를 받지 못했습니다.");
        return;
      }

      try {
        const tokens = await invoke<BaseTokens>(provider.exchangeCommand, provider.exchangeArgs(code, port));

        // 권한이 빠진 토큰을 저장하면 "연결됨"으로 보이면서 정작 데이터는 비어 있는
        // 원인 불명 상태가 된다. 저장하지 않고 다시 로그인하도록 안내한다.
        const missing = findMissingScopes(tokens.scope, provider.requiredScopes);
        if (missing.length > 0) {
          onError(provider.missingScopeError);
          return;
        }

        onTokens(tokens);
      } catch (e) {
        onError(String(e));
      }
    });

    await open(provider.buildAuthUrl(port));
  } catch (e) {
    onError(String(e));
  }
}

/** 만료 임박(또는 force) 시 토큰 갱신. 갱신 실패(auth_error)는 AuthError로 변환 */
function createTokenRefresher(provider: OAuthProvider) {
  return async function refreshTokenIfNeeded(tokens: BaseTokens, force = false): Promise<BaseTokens> {
    if (!tokens.refresh_token) return tokens;
    if (!force && (tokens.expiresAt ?? 0) - Date.now() > 5 * 60 * 1000) return tokens;
    if (!provider.clientId) return tokens;

    let refreshed: RefreshResponse;
    try {
      refreshed = await invoke<RefreshResponse>(provider.refreshCommand, provider.refreshArgs(tokens.refresh_token));
    } catch (e) {
      const message = String(e);
      if (message.startsWith("auth_error:")) {
        throw new AuthError(message.slice("auth_error:".length));
      }
      throw e;
    }

    return {
      ...tokens,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
      expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
    };
  };
}

export const startGoogleOAuth = (
  onTokens: (tokens: BaseTokens) => void,
  onError: (err: string) => void
) => startOAuth(googleProvider, onTokens, onError);

export const startMicrosoftOAuth = (
  onTokens: (tokens: BaseTokens) => void,
  onError: (err: string) => void
) => startOAuth(microsoftProvider, onTokens, onError);

export const refreshGoogleTokenIfNeeded = createTokenRefresher(googleProvider);
export const refreshMicrosoftTokenIfNeeded = createTokenRefresher(microsoftProvider);