import { create } from "zustand";
import { storeDelete, storeGet, storeSet } from "@/lib/tauri-store";
import {
  refreshGoogleTokenIfNeeded,
  refreshMicrosoftTokenIfNeeded,
} from "@/lib/oauth";
import { showToast } from '@/store/toast'

let googleRefreshPromise: Promise<GoogleTokens | null> | null = null;
let microsoftRefreshPromise: Promise<MicrosoftTokens | null> | null = null;

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expiresAt?: number;
}

export interface MicrosoftTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expiresAt?: number;
}

interface AuthStore {
  googleTokens: GoogleTokens | null;
  microsoftTokens: MicrosoftTokens | null;
  setGoogleTokens: (tokens: GoogleTokens | null) => void;
  setMicrosoftTokens: (tokens: MicrosoftTokens | null) => void;
  loadFromStore: () => Promise<void>;
  /** 만료 임박 시 토큰 갱신 후 최신 토큰 반환 */
  refreshGoogle: (force?: boolean) => Promise<GoogleTokens | null>;
  refreshMicrosoft: (force?: boolean) => Promise<MicrosoftTokens | null>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  googleTokens: null,
  microsoftTokens: null,

  setGoogleTokens: (tokens) => {
    set({ googleTokens: tokens });
    storeSet("google.tokens", tokens);
  },

  setMicrosoftTokens: (tokens) => {
    set({ microsoftTokens: tokens });
    storeSet("microsoft.tokens", tokens);
  },

  loadFromStore: async () => {
    const [googleTokens, microsoftTokens] = await Promise.all([
      storeGet<GoogleTokens>("google.tokens"),
      storeGet<MicrosoftTokens>("microsoft.tokens"),
    ]);
    set({ googleTokens, microsoftTokens });
  },

  refreshGoogle: async (force = false) => {
    if (googleRefreshPromise && !force) return googleRefreshPromise;
    const tokens = get().googleTokens;
    if (!tokens) return null;

    googleRefreshPromise = (async () => {
      try {
        const refreshed = await refreshGoogleTokenIfNeeded(tokens, force);
        if (
          refreshed.access_token !== tokens.access_token ||
          refreshed.refresh_token !== tokens.refresh_token ||
          refreshed.expiresAt !== tokens.expiresAt
        ) {
          const updated = refreshed as GoogleTokens;
          set({ googleTokens: updated });
          await storeSet("google.tokens", updated);
          return updated;
        }
      } catch (e) {
        // 토큰 초기화, 재연결 안내
        if (String(e).startsWith("auth_error:")) {
          set({ googleTokens: null });
          await storeDelete("google.tokens");
          showToast("Google 연결이 만료되었습니다. 설정에서 다시 연결해주세요.");
          return null;
        }
      }
      return get().googleTokens;
    })().finally(() => {
      googleRefreshPromise = null;
    });

    return googleRefreshPromise;
  },

  refreshMicrosoft: async (force = false) => {
    if (microsoftRefreshPromise && !force) return microsoftRefreshPromise;
    const tokens = get().microsoftTokens;
    if (!tokens) return null;

    microsoftRefreshPromise = (async () => {
      try {
        const refreshed = await refreshMicrosoftTokenIfNeeded(tokens, force);
        if (
          refreshed.access_token !== tokens.access_token ||
          refreshed.refresh_token !== tokens.refresh_token ||
          refreshed.expiresAt !== tokens.expiresAt
        ) {
          const updated = refreshed as MicrosoftTokens;
          set({ microsoftTokens: updated });
          await storeSet("microsoft.tokens", updated);
          return updated;
        }
      } catch (e) {
        // 갱신 실패
        if (String(e).startsWith("auth_error:")) {
          set({ microsoftTokens: null });
          await storeDelete("microsoft.tokens");
          showToast("Microsoft 연결이 만료되었습니다. 설정에서 다시 연결해주세요.");
          return null;
        }
      }
      return get().microsoftTokens;
    })().finally(() => {
      microsoftRefreshPromise = null;
    });

    return microsoftRefreshPromise;
  },
}));
