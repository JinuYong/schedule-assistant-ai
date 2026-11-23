import { isTauri } from "./tauri-store";

/** 주소를 시스템 브라우저에서 연다(Tauri가 아니면 새 탭) */
export async function openUrl(url: string): Promise<void> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}
