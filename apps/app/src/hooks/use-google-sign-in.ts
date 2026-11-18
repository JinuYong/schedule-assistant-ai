import { useCallback } from "react";
import { startGoogleOAuth } from "@/lib/oauth";
import { useAuthStore } from "@/store/auth";
import { useAccountStore } from "@/store/account";
import { useOAuthConnection } from "@/hooks/use-oauth-connection";

/**
 * Google 로그인 = Google 캘린더 연결 + Cali 서버 계정 로그인.
 * 로그인 화면(SignInGate)과 설정의 다시 연결이 같이 쓴다.
 */
export function useGoogleSignIn() {
  const setGoogleTokens = useAuthStore((s) => s.setGoogleTokens);
  const signInWithGoogle = useAccountStore((s) => s.signInWithGoogle);
  const afterConnect = useCallback(
    (tokens: { id_token?: string }) => void signInWithGoogle(tokens.id_token),
    [signInWithGoogle],
  );
  return useOAuthConnection(startGoogleOAuth, setGoogleTokens, afterConnect);
}
