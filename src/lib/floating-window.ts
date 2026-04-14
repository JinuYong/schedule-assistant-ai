import { isTauri } from "./tauri-store";

async function getFloatingWindow() {
  if (!isTauri()) return null;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  return WebviewWindow.getByLabel("floating");
}

export async function showFloatingWindow(): Promise<void> {
  const win = await getFloatingWindow();
  if (!win) return;
  await win.show();
  await win.setFocus();
}

export async function hideFloatingWindow(): Promise<void> {
  const win = await getFloatingWindow();
  if (!win) return;
  await win.hide();
}

export async function toggleFloatingWindow(): Promise<void> {
  const win = await getFloatingWindow();
  if (!win) return;
  const visible = await win.isVisible();
  visible ? await win.hide() : (await win.show(), await win.setFocus());
}
