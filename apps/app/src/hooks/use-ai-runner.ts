import { useEffect } from "react";
import { emit } from "@tauri-apps/api/event";
import { createGeminiProvider } from "@/lib/ai/gemini";
import { googleCalendarBackend } from "@/lib/ai/google-backend";
import { createMockCalendarBackend } from "@/lib/ai/mock-backend";
import { getGeminiKey } from "@/lib/ai/settings";
import { startMainBridge } from "@/lib/ai/bridge";
import { MOCK_ENABLED } from "@/lib/dev-mock";
import { isTauri, storeGet } from "@/lib/tauri-store";
import {
  DEFAULT_CALENDAR_KEY,
  resolveDefaultCalendarId,
} from "@/hooks/use-default-calendar";
import { useAuthStore } from "@/store/auth";
import { configureAi } from "@/store/ai";

/**
 * 메인 창에서 한 번: AI 세션의 실행 환경(공급자·일정 백엔드)을 꽂고, 플로팅 창의 부탁을 받는다.
 * 메인 창은 닫아도 숨김이라(src-tauri lib.rs) 플로팅만 띄워 쓸 때도 살아 있다.
 */
export function useAiRunner() {
  useEffect(() => {
    configureAi({
      provider: createGeminiProvider({ getKey: getGeminiKey }),
      backend: MOCK_ENABLED
        ? createMockCalendarBackend()
        : googleCalendarBackend(
            async () =>
              (await useAuthStore.getState().refreshGoogle())?.access_token ??
              null,
          ),
      defaultCalendarId: async (calendars) =>
        resolveDefaultCalendarId(
          calendars,
          await storeGet<string>(DEFAULT_CALENDAR_KEY),
          calendars.find((c) => c.primary)?.id ?? "primary",
        ),
      // 일정 화면·플로팅 자동완성이 다시 읽는다(일정 화면이 이 이벤트를 듣는다)
      onMutated: () => {
        if (isTauri()) void emit("calendar-mutated");
      },
    });
    const stopBridge = startMainBridge();
    return () => {
      stopBridge();
      configureAi(null);
    };
  }, []);
}
