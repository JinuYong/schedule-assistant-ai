import { useCallback, useState } from "react";
import type { BaseTokens } from "@/types/tokens";

type StartOAuth = (
  onTokens: (tokens: BaseTokens) => void,
  onError: (err: string) => void,
) => Promise<void>;

/**
 * OAuth 연결 흐름(상태 + 에러 + connect)을 provider별로 캡슐화.
 *
 * settings 페이지의 Google/Microsoft 연결이 95% 동일했던 부분
 * (waiting→토큰 저장(expiresAt 계산)→idle / 실패 시 error)을 통합한다.
 */
export function useOAuthConnection(
  start: StartOAuth,
  setTokens: (tokens: BaseTokens) => void,
  /** 저장과 별개로 교환 응답 원본이 필요할 때(Google id_token → Cali 서버 로그인) */
  afterConnect?: (tokens: BaseTokens) => void,
) {
  const [status, setStatus] = useState<"idle" | "waiting" | "error">("idle");
  const [error, setError] = useState("");

  const connect = useCallback(async () => {
    setStatus("waiting");
    setError("");
    await start(
      (tokens) => {
        setTokens({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          // 승인된 권한을 함께 남긴다 — 나중에 "권한이 빠진 채 저장된 토큰"을
          // 판별해 재로그인을 안내할 근거가 된다.
          scope: tokens.scope,
          expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
        });
        setStatus("idle");
        afterConnect?.(tokens);
      },
      (err) => {
        setError(err);
        setStatus("error");
      },
    );
  }, [start, setTokens, afterConnect]);

  return { status, error, connect };
}
