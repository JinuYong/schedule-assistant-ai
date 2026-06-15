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