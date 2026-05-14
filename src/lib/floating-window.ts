import { isTauri } from "./tauri-store";

async function getFloatingWindow() {
  if (!isTauri()) return null;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  return WebviewWindow.getByLabel("floating");
}

/** Rust가 커서 위치 감지 + 모니터 선택 + 앱 활성화 + 표시를 모두 처리 */
async function showWindow(
  win: NonNullable<Awaited<ReturnType<typeof getFloatingWindow>>>
) {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("show_floating");
      return;
    } catch (e) {
      console.error("[floating-window] show_floating 실패:", e);
    }
  }
  // fallback (브라우저 또는 Rust 커맨드 실패 시)
  await win.show();
  await win.setFocus();
}

export async function showFloatingWindow(): Promise<void> {
  const win = await getFloatingWindow();
  if (!win) return;
  await showWindow(win);
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

export async function toggleFloatingWindow(): Promise<void> {
  const win = await getFloatingWindow();
  if (!win) return;
  const visible = await win.isVisible();
  if (visible) {
    await win.hide();
  } else {
    await showWindow(win);
  }
}