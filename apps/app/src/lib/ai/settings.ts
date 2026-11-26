// AI 설정값(키). 앱에선 tauri-store, 브라우저 개발(더미 모드)에선 localStorage.

import { isTauri, storeGet, storeSet } from "@/lib/tauri-store";

/** tauri-store 키 */
export const GEMINI_KEY_STORE = "gemini.apiKey";
/** 브라우저 개발용(localStorage) — 앱 저장소가 없어서 */
const DEV_KEY = "dev.gemini.apiKey";

export async function getGeminiKey(): Promise<string | null> {
  if (isTauri())
    return (await storeGet<string>(GEMINI_KEY_STORE))?.trim() || null;
  try {
    return localStorage.getItem(DEV_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export async function setGeminiKey(key: string): Promise<void> {
  const v = key.trim();
  if (isTauri()) return storeSet(GEMINI_KEY_STORE, v);
  try {
    localStorage.setItem(DEV_KEY, v);
  } catch {
    /* 저장 못 해도 무시 */
  }
}
