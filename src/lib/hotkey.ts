import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { isTauri } from "./tauri-store";

export const DEFAULT_SHORTCUT = "Option+Space";

export async function registerHotkey(shortcut: string, handler: () => void): Promise<void> {
  if (!isTauri()) return;
  try {
    await register(shortcut, handler);
  } catch (e) {
    console.warn("[hotkey] 등록 실패:", e);
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
