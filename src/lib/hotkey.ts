import { register, unregister, unregisterAll, type ShortcutEvent } from "@tauri-apps/plugin-global-shortcut";
import { isTauri } from "./tauri-store";

export const DEFAULT_SHORTCUT = "Option+Space";

export async function registerHotkey(shortcut: string, handler: () => void): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    await register(shortcut, (event: ShortcutEvent) => {
      // Pressed 일 때만 실행 (Released 때 중복 발동 방지)
      if (event.state === "Pressed") {
        handler();
      }
    });
    return true;
  } catch (e) {
    console.warn("[hotkey] 등록 실패:", e);
    return false;
  }
}

export async function unregisterHotkey(shortcut: string): Promise<void> {
  if (!isTauri()) return;
  try {
    await unregister(shortcut);
  } catch (e) {
    console.warn("[hotkey] 개별 해제 실패:", e);
  }
}

export async function unregisterHotkeys(): Promise<void> {
  if (!isTauri()) return;
  try {
    await unregisterAll();
  } catch (e) {
    console.warn("[hotkey] 해제 실패:", e);
  }
}