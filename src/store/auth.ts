import { create } from "zustand";
import { storeDelete, storeGet, storeSet } from "@/lib/tauri-store";
import {
  refreshGoogleTokenIfNeeded,
  refreshMicrosoftTokenIfNeeded,
} from "@/lib/oauth";
import { showToast } from '@/store/toast'

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
  refreshGoogle: () => Promise<GoogleTokens | null>;
  refreshMicrosoft: () => Promise<MicrosoftTokens | null>;
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

  refreshGoogle: async () => {
    const tokens = get().googleTokens;
    if (!tokens) return null;
    try {
      const refreshed = await refreshGoogleTokenIfNeeded(tokens);
      if (refreshed.access_token !== tokens.access_token) {
        const updated = refreshed as GoogleTokens;
        set({ googleTokens: updated });
        storeSet("google.tokens", updated);
      }
    } catch (e) {
      // 토큰 초기화, 재연결 안내
      if (String(e).startsWith("auth_error:")) {
        set({ googleTokens: null });
        storeDelete("google.tokens");
        showToast("Google 연결이 만료되었습니다. 설정에서 다시 연결해주세요.");
        return null;
      }
    }
    return get().googleTokens;
  },

  refreshMicrosoft: async () => {
    const tokens = get().microsoftTokens;
    if (!tokens) return null;
    try {
      const refreshed = await refreshMicrosoftTokenIfNeeded(tokens);
      if (refreshed.access_token !== tokens.access_token) {
        const updated = refreshed as MicrosoftTokens;
        set({ microsoftTokens: updated });
        storeSet("microsoft.tokens", updated);
      }
    } catch (e) {
      // 갱신 실패
      if (String(e).startsWith("auth_error:")) {
        set({ googleTokens: null });
        storeDelete("google.tokens");
        showToast("Google 연결이 만료되었습니다. 설정에서 다시 연결해주세요.");
        return null;
      }
    }
    return get().microsoftTokens;
  },
}));
