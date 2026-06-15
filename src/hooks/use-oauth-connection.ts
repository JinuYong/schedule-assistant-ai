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
export function useOAuthConnection(start: StartOAuth, setTokens: (tokens: BaseTokens) => void) {
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
          expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
        });
        setStatus("idle");
      },
      (err) => {
        setError(err);
        setStatus("error");
      }
    );
  }, [start, setTokens]);

  return { status, error, connect };
}
