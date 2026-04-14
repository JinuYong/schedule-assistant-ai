"use client";

import { useEffect } from "react";
import { isTauri, storeGet } from "@/lib/tauri-store";
import { registerHotkey, DEFAULT_SHORTCUT } from "@/lib/hotkey";
import { toggleFloatingWindow } from "@/lib/floating-window";

/** Tauri 앱 초기화: 전역 단축키 등록 */
export default function TauriInit() {
  useEffect(() => {
    if (!isTauri()) return;

    let cleanup = false;

    (async () => {
      const shortcut =
        (await storeGet<string>("hotkey")) ?? DEFAULT_SHORTCUT;

      if (cleanup) return;
      await registerHotkey(shortcut, () => {
        toggleFloatingWindow();
      });
    })();

    return () => {
      cleanup = true;
    };
  }, []);

  return null;
}
