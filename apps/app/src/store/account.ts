import { create } from "zustand";
import type { PublicUser } from "@cali/shared";
import { api, ApiRequestError } from "@/lib/api";
import { MOCK_ENABLED } from "@/lib/dev-mock";
import { storeDelete, storeGet, storeSet } from "@/lib/tauri-store";

const STORE_KEY = "server.session";

export interface ServerSession {
  /** 서버가 준 세션 토큰. 요청마다 Authorization: Bearer */
  token: string;
  user: PublicUser;
}

interface AccountStore {
  session: ServerSession | null;
  status: "idle" | "signing-in" | "error";
  error: string;
  /** 저장된 세션을 한 번 읽었는지. 읽기 전에는 로그인 화면을 띄우지 않는다(로그인돼 있어도 깜빡임) */
  ready: boolean;
  loadFromStore: () => Promise<void>;
  /** Google 로그인 직후 부른다. id_token이 없으면(예전 권한으로 받은 토큰) 다시 로그인을 안내 */
  signInWithGoogle: (idToken: string | undefined) => Promise<void>;
  /** 서버에 세션이 살아 있는지 확인하고 사용자 정보를 갱신. 만료면 세션을 지운다 */
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * Cali 서버 계정(로그인 세션). Google 로그인이 곧 Cali 계정이다 — Google 캘린더 연결과 함께 맺고 함께 끊는다.
 * 세션이 없으면 앱 대신 로그인 화면이 뜬다(SignInGate). 로컬 전용 모드는 두지 않는다.
 * 저장된 세션은 서버가 잠깐 안 돼도 지우지 않는다(401일 때만) — 오프라인이어도 앱이 열린다.
 */
export const useAccountStore = create<AccountStore>((set, get) => {
  const clear = async () => {
    set({ session: null });
    await storeDelete(STORE_KEY);
  };

  return {
    session: null,
    status: "idle",
    error: "",
    ready: false,

    loadFromStore: async () => {
      if (MOCK_ENABLED) return set({ ready: true });
      set({ session: await storeGet<ServerSession>(STORE_KEY), ready: true });
    },

    signInWithGoogle: async (idToken) => {
      if (!idToken) {
        set({
          status: "error",
          error: "Cali 계정 정보를 받지 못했습니다. 다시 로그인해 주세요.",
        });
        return;
      }
      set({ status: "signing-in", error: "" });
      try {
        const { token, user } = await api.loginWithGoogle(idToken);
        const session = { token, user };
        set({ session, status: "idle" });
        await storeSet(STORE_KEY, session);
      } catch (e) {
        console.error("[account] 서버 로그인 실패", e);
        set({
          status: "error",
          error:
            "Cali 서버에 로그인하지 못했습니다. 잠시 뒤 다시 로그인해 주세요.",
        });
      }
    },

    refreshMe: async () => {
      const session = get().session;
      if (!session) return;
      try {
        const { user } = await api.me(session.token);
        const next = { ...session, user };
        set({ session: next });
        await storeSet(STORE_KEY, next);
      } catch (e) {
        // 401만 세션 만료로 본다. 서버가 잠깐 안 되는 건 세션을 지울 이유가 아니다
        if (e instanceof ApiRequestError && e.status === 401) await clear();
        else console.warn("[account] 세션 확인 실패", e);
      }
    },

    signOut: async () => {
      const session = get().session;
      await clear();
      set({ status: "idle", error: "" });
      if (session)
        await api
          .logout(session.token)
          .catch((e) => console.warn("[account] 서버 로그아웃 실패", e));
    },
  };
});
