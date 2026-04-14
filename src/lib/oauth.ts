import { invoke } from "@tauri-apps/api/core";
import { isTauri, storeGet } from "./tauri-store";

// 빌드 시 번들된 Google OAuth credentials (개발자가 .env.local에 설정)
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET ?? "";

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

interface MicrosoftTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export async function startGoogleOAuth(
  onTokens: (tokens: GoogleTokens) => void,
  onError: (err: string) => void
): Promise<void> {
  if (!isTauri()) {
    onError("Tauri 환경이 아닙니다.");
    return;
  }

  if (!GOOGLE_CLIENT_ID) {
    onError("Google Client ID가 설정되지 않았습니다. 개발자에게 문의하세요.");
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
        const tokens = await invoke<GoogleTokens>("exchange_google_token", {
          code,
          clientId: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET,
          redirectUri: `http://localhost:${port}`,
        });
        onTokens(tokens);
      } catch (e) {
        onError(String(e));
      }
    });

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(`http://localhost:${port}`)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent("https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email")}` +
      `&access_type=offline` +
      `&prompt=consent`;

    await open(authUrl);
  } catch (e) {
    onError(String(e));
  }
}

export async function startMicrosoftOAuth(
  onTokens: (tokens: MicrosoftTokens) => void,
  onError: (err: string) => void
): Promise<void> {
  if (!isTauri()) {
    onError("Tauri 환경이 아닙니다.");
    return;
  }

  const clientId = await storeGet<string>("microsoft.clientId");
  const clientSecret = await storeGet<string>("microsoft.clientSecret");

  if (!clientId || !clientSecret) {
    onError("Microsoft Client ID / Secret이 설정되지 않았습니다.");
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
        const tokens = await invoke<MicrosoftTokens>("exchange_microsoft_token", {
          code,
          clientId,
          clientSecret,
          redirectUri: `http://localhost:${port}`,
          tenant: "common",
        });
        onTokens(tokens);
      } catch (e) {
        onError(String(e));
      }
    });

    const scopes = "Tasks.ReadWrite offline_access User.Read";
    const authUrl =
      `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(`http://localhost:${port}`)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&response_mode=query`;

    await open(authUrl);
  } catch (e) {
    onError(String(e));
  }
}

export async function refreshGoogleTokenIfNeeded(tokens: {
  access_token: string;
  refresh_token?: string;
  expiresAt?: number;
}): Promise<typeof tokens> {
  if (!tokens.refresh_token) return tokens;
  if ((tokens.expiresAt ?? 0) - Date.now() > 5 * 60 * 1000) return tokens;
  if (!GOOGLE_CLIENT_ID) return tokens;

  const refreshed = await invoke<{ access_token: string; expires_in?: number }>(
    "refresh_google_token",
    { refreshToken: tokens.refresh_token, clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET }
  );

  return {
    ...tokens,
    access_token: refreshed.access_token,
    expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
  };
}

export async function refreshMicrosoftTokenIfNeeded(tokens: {
  access_token: string;
  refresh_token?: string;
  expiresAt?: number;
}): Promise<typeof tokens> {
  if (!tokens.refresh_token) return tokens;
  if ((tokens.expiresAt ?? 0) - Date.now() > 5 * 60 * 1000) return tokens;

  const clientId = await storeGet<string>("microsoft.clientId");
  const clientSecret = await storeGet<string>("microsoft.clientSecret");
  if (!clientId || !clientSecret) return tokens;

  const refreshed = await invoke<{ access_token: string; expires_in?: number }>(
    "refresh_microsoft_token",
    {
      refreshToken: tokens.refresh_token,
      clientId,
      clientSecret,
      tenant: "common",
    }
  );

  return {
    ...tokens,
    access_token: refreshed.access_token,
    expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
  };
}
