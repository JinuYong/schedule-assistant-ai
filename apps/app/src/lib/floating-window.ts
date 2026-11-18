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

/**
 * 플로팅 창을 닫고 메인 창을 앞으로(숨김·최소화돼 있어도). 로그인이 필요할 때 로그인 화면으로 보낸다.
 * 숨기기와 띄우기를 Rust에서 한 번에 한다 — 플로팅 창을 먼저 숨기면 그 창의 JS가 멈춰 다음 호출이 안 나갈 수 있다.
 */
export async function openMainWindow(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_main_window").catch((e) =>
    console.error("[floating-window] open_main_window 실패:", e),
  );
}
