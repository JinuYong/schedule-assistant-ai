mod claude;
mod error;
mod floating_macos;
mod oauth;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_oauth::init())
        .setup(|app| {
            // macOS 플로팅 창 setup (NSPanel 변환 + main 창 behavior + Space 폴링)
            floating_macos::setup(app);
            // 메인 단축키를 Rust 레벨에서 등록 (WebView HMR 재로드와 무관하게 영구 동작)
            floating_macos::register_global_shortcut(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            claude::call_claude,
            claude::stream_chat,
            floating_macos::show_floating,
            floating_macos::hide_floating,
            floating_macos::set_global_shortcut,
            oauth::exchange_google_token,
            oauth::refresh_google_token,
            oauth::exchange_microsoft_token,
            oauth::refresh_microsoft_token,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            match event {
                // main 창 닫기 버튼 → 창만 숨기고 백그라운드 상주, Dock 아이콘 유지
                // floating 창 포커스 이벤트: Focused(true) 시각 기록 → Focused(false) 300ms 필터
                tauri::RunEvent::WindowEvent { label, event, .. } => {
                    if label == "main" {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = &event {
                            api.prevent_close();
                            if let Some(win) = app_handle.get_webview_window("main") {
                                win.hide().ok();
                            }
                        }
                    }
                    if label == "floating" {
                        match &event {
                            tauri::WindowEvent::Focused(true) => {
                                floating_macos::on_floating_focused(app_handle);
                            }
                            tauri::WindowEvent::Focused(false) => {
                                floating_macos::on_floating_unfocused(app_handle);
                            }
                            _ => {}
                        }
                    }
                }
                // Dock 아이콘 클릭 / Finder 더블클릭 → main 창 복원 (macOS 전용)
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { has_visible_windows, .. } => {
                    if !has_visible_windows {
                        if let Some(win) = app_handle.get_webview_window("main") {
                            win.show().ok();
                            win.set_focus().ok();
                        }
                    }
                }
                _ => {}
            }
        });
}
