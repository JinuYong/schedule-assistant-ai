import { useEffect } from "react";
import { MOCK_ENABLED } from "@/lib/dev-mock";
import { useAuthStore } from "@/store/auth";
import { useAccountStore } from "@/store/account";
import { useGoogleSignIn } from "@/hooks/use-google-sign-in";
import styles from "./sign-in-gate.module.css";

/**
 * Cali 계정(Google 로그인)이 있어야 앱을 연다. 로컬 전용 모드는 두지 않는다 —
 * 일정은 Google 캘린더, 할일·메모는 서버, AI는 로그인한 사람만 쓴다.
 * 더미 모드(VITE_MOCK=1, 브라우저 개발)는 막지 않는다.
 */
export default function SignInGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const ready = useAccountStore((s) => s.ready);
  const session = useAccountStore((s) => s.session);
  const refreshMe = useAccountStore((s) => s.refreshMe);

  // 앱을 열 때 세션이 서버에서 아직 살아 있는지 확인(만료·로그아웃이면 로그인 화면으로)
  useEffect(() => {
    if (ready) void refreshMe();
  }, [ready, refreshMe]);

  if (MOCK_ENABLED) return children;
  if (!ready) return null;
  if (session) return children;
  return <SignInScreen />;
}

function SignInScreen() {
  const google = useGoogleSignIn();
  const status = useAccountStore((s) => s.status);
  const accountError = useAccountStore((s) => s.error);
  // 예전 버전에서 캘린더만 연결해 둔 사람: 서버 계정 로그인이 한 번 더 필요하다
  const hadCalendarOnly = useAuthStore((s) => s.googleTokens !== null);

  const busy = google.status === "waiting" || status === "signing-in";
  const error = google.error || (status === "error" ? accountError : "");

  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <img
          src="/icon-source.png"
          className={styles.icon}
          alt=""
          draggable={false}
        />
        <h1 className={styles.title}>Cali</h1>
        <p className={styles.text}>
          Google 계정으로 로그인하면 Google 캘린더 일정을 보고, AI 비서에게
          일정을 맡길 수 있어요.
        </p>
        {hadCalendarOnly && !error && (
          <p className={styles.notice}>
            업데이트로 Cali 계정이 생겼어요. 한 번만 다시 로그인해 주세요.
          </p>
        )}
        <button
          type="button"
          className={styles.button}
          onClick={() => void google.connect()}
          disabled={busy}
        >
          {google.status === "waiting"
            ? "브라우저에서 로그인하는 중..."
            : status === "signing-in"
              ? "Cali 계정에 연결하는 중..."
              : "Google로 시작하기"}
        </button>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </main>
  );
}
