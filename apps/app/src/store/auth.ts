import { create } from "zustand";
import { storeDelete, storeGet, storeSet } from "@/lib/tauri-store";
import {
  refreshGoogleTokenIfNeeded,
  refreshMicrosoftTokenIfNeeded,
} from "@/lib/oauth";
import { AuthError } from "@/lib/api-errors";
import { createSingleFlight, type SingleFlight } from "@/lib/promise-cache";
import type { BaseTokens } from "@/types/tokens";
import { MOCK_ENABLED, MOCK_GOOGLE_TOKENS, MOCK_MICROSOFT_TOKENS } from "@/lib/dev-mock";
import { showToast } from '@/store/toast'

export type GoogleTokens = BaseTokens;
export type MicrosoftTokens = BaseTokens;

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

/** provider별 토큰 갱신 흐름 (single-flight + 상태/스토어 반영 + AuthError 처리) */
interface RefreshConfig<T extends BaseTokens> {
  flight: SingleFlight<T | null>;
  /** 현재 보관 중인 토큰 */
  getTokens: () => T | null;
  /** 갱신된 토큰을 상태 + 스토어에 반영 */
  applyTokens: (tokens: T) => Promise<void>;
  /** 만료(AuthError) 시 토큰 제거 */
  clearTokens: () => Promise<void>;
  /** 만료 임박/force 시 실제 갱신 (lib/oauth) */
  refreshIfNeeded: (tokens: T, force: boolean) => Promise<T>;
  /** AuthError 시 안내 토스트 메시지 */
  expiredMessage: string;
}

function createTokenRefresh<T extends BaseTokens>(config: RefreshConfig<T>) {
  return (force = false): Promise<T | null> => {
    if (config.flight.inflight && !force) return config.flight.inflight;
    const tokens = config.getTokens();
    if (!tokens) return Promise.resolve(null);

    return config.flight.run(async () => {
      try {
        const refreshed = await config.refreshIfNeeded(tokens, force);
        if (
          refreshed.access_token !== tokens.access_token ||
          refreshed.refresh_token !== tokens.refresh_token ||
          refreshed.expiresAt !== tokens.expiresAt
        ) {
          await config.applyTokens(refreshed);
          return refreshed;
        }
      } catch (e) {
        // 토큰 초기화, 재연결 안내
        if (e instanceof AuthError) {
          await config.clearTokens();
          showToast(config.expiredMessage);
          return null;
        }
      }
      return config.getTokens();
    });
  };
}

export const useAuthStore = create<AuthStore>((set, get) => {
  const refreshGoogle = createTokenRefresh<GoogleTokens>({
    flight: createSingleFlight<GoogleTokens | null>(),
    getTokens: () => get().googleTokens,
    applyTokens: async (tokens) => {
      set({ googleTokens: tokens });
      await storeSet("google.tokens", tokens);
    },
    clearTokens: async () => {
      set({ googleTokens: null });
      await storeDelete("google.tokens");
    },
    refreshIfNeeded: refreshGoogleTokenIfNeeded,
    expiredMessage: "Google 연결이 만료되었습니다. 설정에서 다시 연결해주세요.",
  });

  const refreshMicrosoft = createTokenRefresh<MicrosoftTokens>({
    flight: createSingleFlight<MicrosoftTokens | null>(),
    getTokens: () => get().microsoftTokens,
    applyTokens: async (tokens) => {
      set({ microsoftTokens: tokens });
      await storeSet("microsoft.tokens", tokens);
    },
    clearTokens: async () => {
      set({ microsoftTokens: null });
      await storeDelete("microsoft.tokens");
    },
    refreshIfNeeded: refreshMicrosoftTokenIfNeeded,
    expiredMessage: "Microsoft 연결이 만료되었습니다. 설정에서 다시 연결해주세요.",
  });

  return {
    googleTokens: MOCK_GOOGLE_TOKENS,
    microsoftTokens: MOCK_MICROSOFT_TOKENS,

    setGoogleTokens: (tokens) => {
      set({ googleTokens: tokens });
      storeSet("google.tokens", tokens);
    },

    setMicrosoftTokens: (tokens) => {
      set({ microsoftTokens: tokens });
      storeSet("microsoft.tokens", tokens);
    },

    loadFromStore: async () => {
      if (MOCK_ENABLED) return; // 더미 모드에선 주입된 토큰 유지
      const [googleTokens, microsoftTokens] = await Promise.all([
        storeGet<GoogleTokens>("google.tokens"),
        storeGet<MicrosoftTokens>("microsoft.tokens"),
      ]);
      set({ googleTokens, microsoftTokens });
    },

    refreshGoogle,
    refreshMicrosoft,
  };
});
