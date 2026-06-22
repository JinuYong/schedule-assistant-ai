import { isTauri } from "./tauri-store";

async function getFloatingWindow() {
  if (!isTauri()) return null;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  return WebviewWindow.getByLabel("floating");
}

export async function hideFloatingWindow(restore = false): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("hide_floating", { restore });
      return;
    } catch (e) {
      console.error("[floating-window] hide_floating 실패:", e);
    }
  }
  // fallback
  const win = await getFloatingWindow();
  if (!win) return;
  await win.hide();
}
