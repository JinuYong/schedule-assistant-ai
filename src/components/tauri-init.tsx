"use client";

// 메인 단축키(Option+Space 등)는 Rust setup 핸들러에서 직접 등록합니다.
// → WebView HMR 재로드 시 JS 콜백 ID 무효화 문제([TAURI] Couldn't find callback id) 방지
// ESC 단축키는 floating/page.tsx에서 창이 열릴 때만 동적으로 등록합니다.
export default function TauriInit() {
  return null;
}