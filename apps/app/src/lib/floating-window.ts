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

/** 메인 창을 앞으로(숨김·최소화돼 있어도). 플로팅 창에서 로그인이 필요할 때 로그인 화면으로 보낸다 */
export async function showMainWindow(): Promise<void> {
  if (!isTauri()) return;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const main = await WebviewWindow.getByLabel("main");
  if (!main) return;
  await main.unminimize().catch(() => {});
  await main.show();
  await main.setFocus();
}
