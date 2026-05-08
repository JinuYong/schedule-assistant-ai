use tauri::{Emitter, Manager};

/// floating 창이 마지막으로 Focused(true)가 된 시각 (ms)
/// Focused(false) spurious 필터링에 사용
static FLOATING_FOCUSED_AT: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);

/// show_floating() 이 마지막으로 호출된 시각 (ms)
/// Space 폴링 스레드에서 표시 직후 600ms 이내에 숨기는 것을 방지
static FLOATING_SHOWN_AT: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);

#[cfg(target_os = "macos")]
use std::ffi::c_void;

// macOS 시스템 API — 모듈 레벨 통합 선언 (중복/unused 경고 방지)
#[cfg(target_os = "macos")]
extern "C" {
    fn sel_registerName(name: *const u8) -> *const c_void;
    fn objc_getClass(name: *const u8) -> *const c_void;
    fn objc_msgSend(receiver: *const c_void, sel: *const c_void, ...) -> *const c_void;
    fn object_setClass(obj: *const c_void, cls: *const c_void) -> *const c_void;
    fn CGSMainConnectionID() -> i32;
    fn CGSGetActiveSpace(connection: i32) -> u64;
}

// macOS: NSEvent + NSScreen 좌표 변환용 구조체
#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Copy, Clone)]
struct NSPoint { x: f64, y: f64 }

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Copy, Clone)]
struct NSSize { width: f64, height: f64 }

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Copy, Clone)]
struct NSRect { origin: NSPoint, size: NSSize }

/// Claude API 비스트리밍 호출 (일정 파싱용)
#[tauri::command]
async fn call_claude(
    api_key: String,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

/// Claude API 스트리밍 호출 (채팅용) — 청크마다 "chat-chunk" 이벤트 emit
#[tauri::command]
async fn stream_chat(
    window: tauri::Window,
    api_key: String,
    system: String,
    messages: serde_json::Value,
) -> Result<(), String> {
    use futures_util::StreamExt;

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&serde_json::json!({
            "model": "claude-sonnet-4-6",
            "max_tokens": 2048,
            "stream": true,
            "system": system,
            "messages": messages
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // HTTP 에러 응답 처리 (401 잘못된 키, 400 잘못된 요청 등)
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        let msg = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|j| {
                j.get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(msg);
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        // SSE 이벤트 파싱
        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim().to_string();
            buffer = buffer[pos + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    window.emit("chat-done", ()).ok();
                    return Ok(());
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(text) = json
                        .get("delta")
                        .and_then(|d| d.get("text"))
                        .and_then(|t| t.as_str())
                    {
                        window.emit("chat-chunk", text).ok();
                    }
                }
            }
        }
    }

    window.emit("chat-done", ()).ok();
    Ok(())
}

/// 플로팅 창을 현재 Space + 커서가 있는 모니터 중앙에 표시
///
/// - NSEvent.mouseLocation + NSScreen: Cocoa 좌표계에서 직접 커서/모니터 감지 (JS보다 정확)
/// - NSPanel + CanJoinAllSpaces|Stationary|IgnoresCycle|FullScreenAuxiliary: 전체화면 Space에 표시
/// - activateIgnoringOtherApps: 키보드 포커스 획득 (NSPanel이므로 Space 전환 없음)
#[tauri::command]
fn show_floating(_app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        const FLOATING_W: f64 = 620.0;
        const FLOATING_H: f64 = 64.0;

        let window = _app
            .get_webview_window("floating")
            .ok_or("floating window not found")?;
        let ns_win = window.ns_window().map_err(|e| e.to_string())?;

        // 커서 위치 기반 모니터 감지 + 창 위치 계산 (Cocoa 좌표계)
        let (lx, ly) = unsafe {
            let raw = objc_msgSend
                as unsafe extern "C" fn(*const c_void, *const c_void, ...) -> *const c_void;

            type FnPoint  = unsafe extern "C" fn(*const c_void, *const c_void) -> NSPoint;
            type FnRect   = unsafe extern "C" fn(*const c_void, *const c_void) -> NSRect;
            type FnUsize  = unsafe extern "C" fn(*const c_void, *const c_void) -> usize;
            type FnObjAt  = unsafe extern "C" fn(*const c_void, *const c_void, usize) -> *const c_void;

            let f_point:  FnPoint  = std::mem::transmute(raw);
            let f_rect:   FnRect   = std::mem::transmute(raw);
            let f_usize:  FnUsize  = std::mem::transmute(raw);
            let f_obj_at: FnObjAt  = std::mem::transmute(raw);

            let sel_mouse_loc = sel_registerName(b"mouseLocation\0".as_ptr());
            let sel_screens   = sel_registerName(b"screens\0".as_ptr());
            let sel_count     = sel_registerName(b"count\0".as_ptr());
            let sel_obj_at    = sel_registerName(b"objectAtIndex:\0".as_ptr());
            let sel_frame     = sel_registerName(b"frame\0".as_ptr());

            let ns_event = objc_getClass(b"NSEvent\0".as_ptr());
            let mouse: NSPoint = f_point(ns_event, sel_mouse_loc);

            let ns_screen = objc_getClass(b"NSScreen\0".as_ptr());
            let screens = objc_msgSend(ns_screen, sel_screens);
            let count: usize = f_usize(screens, sel_count);

            if count > 0 {
                let mut rects: Vec<NSRect> = Vec::with_capacity(count);
                for i in 0..count {
                    rects.push(f_rect(f_obj_at(screens, sel_obj_at, i), sel_frame));
                }
                let primary_h = rects[0].origin.y + rects[0].size.height;
                let target = rects
                    .iter()
                    .find(|r| {
                        mouse.x >= r.origin.x && mouse.x < r.origin.x + r.size.width
                            && mouse.y >= r.origin.y && mouse.y < r.origin.y + r.size.height
                    })
                    .copied()
                    .unwrap_or(rects[0]);
                let screen_top = primary_h - target.origin.y - target.size.height;
                (
                    target.origin.x + (target.size.width  - FLOATING_W) / 2.0,
                    screen_top       + (target.size.height - FLOATING_H) * 0.35,
                )
            } else {
                (0.0, 0.0)
            }
        };

        // 위치 설정 (set_position 이 내부적으로 NSWindow 속성을 건드릴 수 있으므로 먼저 실행)
        window
            .set_position(tauri::LogicalPosition { x: lx, y: ly })
            .map_err(|e| e.to_string())?;

        // show_floating() 호출 시각 기록 → Space 폴링 스레드의 즉시-숨김 방지
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        FLOATING_SHOWN_AT.store(now_ms, std::sync::atomic::Ordering::Relaxed);

        // behavior/level 재설정 + 창 표시 (set_position 이후 플래그 덮어씌워지지 않도록)
        unsafe {
            let raw = objc_msgSend
                as unsafe extern "C" fn(*const c_void, *const c_void, ...) -> *const c_void;

            // A. behavior + level: set_position 이후 재적용 (setup과 동일 플래그 유지)
            type FnSetBeh   = unsafe extern "C" fn(*const c_void, *const c_void, usize);
            type FnSetLevel = unsafe extern "C" fn(*const c_void, *const c_void, i64);
            let f_set_beh:   FnSetBeh   = std::mem::transmute(raw);
            let f_set_level: FnSetLevel = std::mem::transmute(raw);
            let sel_beh   = sel_registerName(b"setCollectionBehavior:\0".as_ptr());
            let sel_level = sel_registerName(b"setLevel:\0".as_ptr());
            f_set_beh(ns_win as *const c_void, sel_beh, 1 | 16 | 64 | 256);
            f_set_level(ns_win as *const c_void, sel_level, 1000i64); // NSScreenSaverWindowLevel

            let ns_app_cls = objc_getClass(b"NSApplication\0".as_ptr());
            let sel_shared = sel_registerName(b"sharedApplication\0".as_ptr());
            let ns_app     = objc_msgSend(ns_app_cls, sel_shared);

            // B. orderFrontRegardless: 포커스·키 윈도우 변경 없이 창만 현재 Space에 표시
            //    makeKeyAndOrderFront와 달리 앱 활성화를 전제하지 않음
            //    → activateIgnoringOtherApps 호출 시점에 우리 창이 이미 현재 Space에 존재
            //      macOS가 다른 Space로 전환할 이유 없이 현재 Space에서 앱을 활성화함
            type FnVoidSel = unsafe extern "C" fn(*const c_void, *const c_void);
            let f_void: FnVoidSel = std::mem::transmute(raw);
            let sel_ofr = sel_registerName(b"orderFrontRegardless\0".as_ptr());
            f_void(ns_win as *const c_void, sel_ofr);

            // C. 앱 활성화 → 키보드 포커스 획득 (ESC·텍스트 입력)
            //    창이 이미 현재 Space에 있으므로 Space 전환 없이 활성화 기대
            let sel_act = sel_registerName(b"activateIgnoringOtherApps:\0".as_ptr());
            type FnActivate = unsafe extern "C" fn(*const c_void, *const c_void, bool);
            let f_act: FnActivate = std::mem::transmute(raw);
            f_act(ns_app, sel_act, true);

            // D. 활성화 후 키 윈도우로 지정 → WebView 키보드 이벤트 수신
            let sel_mkw = sel_registerName(b"makeKeyWindow\0".as_ptr());
            f_void(ns_win as *const c_void, sel_mkw);
        }

        // 프론트엔드에 표시 알림 → ESC 글로벌 단축키 등록 트리거
        window.emit("floating-shown", ()).ok();

        return Ok(());
    }

    #[allow(unreachable_code)]
    {
        if let Some(w) = _app.get_webview_window("floating") {
            w.show().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

/// 플로팅 창 숨기기
/// 프론트엔드에서 win.hide() 대신 이 커맨드를 호출해야 함
#[tauri::command]
fn hide_floating(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("floating") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Google OAuth authorization_code → tokens 교환
#[tauri::command]
async fn exchange_google_token(
    code: String,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

/// Google access token 갱신
#[tauri::command]
async fn refresh_google_token(
    refresh_token: String,
    client_id: String,
    client_secret: String,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("refresh_token", refresh_token.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let body: serde_json::Value = response.json().await.unwrap_or_default();
        let error = body.get("error").and_then(|e| e.as_str()).unwrap_or("unknown");
        return Err(format!("auth_error:{error}"));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

/// Microsoft OAuth authorization_code → tokens 교환
#[tauri::command]
async fn exchange_microsoft_token(
    code: String,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    tenant: String,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://login.microsoftonline.com/{}/oauth2/v2.0/token",
        tenant
    );
    let response = client
        .post(&url)
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

/// Microsoft access token 갱신
#[tauri::command]
async fn refresh_microsoft_token(
    refresh_token: String,
    client_id: String,
    client_secret: String,
    tenant: String,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://login.microsoftonline.com/{}/oauth2/v2.0/token",
        tenant
    );
    let response = client
        .post(&url)
        .form(&[
            ("refresh_token", refresh_token.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("grant_type", "refresh_token"),
            ("scope", "Tasks.ReadWrite offline_access User.Read"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let body: serde_json::Value = response.json().await.unwrap_or_default();
        let error = body.get("error").and_then(|e| e.as_str()).unwrap_or("unknown");
        return Err(format!("auth_error:{error}"));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_oauth::init())
        .setup(|_app| {
            #[cfg(target_os = "macos")]
            {
                // 플로팅 창을 NSPanel(non-activating)로 변환 + behavior/level 초기 설정
                //
                // NSPanel + nonactivatingPanel(128): 앱 활성화 없이 키 윈도우 획득 가능
                //   → activateIgnoringOtherApps 불필요, 독 아이콘 유지(Regular 정책)
                //   → 전체화면 앱 Space에서도 키보드 입력 수신 (ChatGPT Companion Window 방식)
                if let Some(win) = _app.get_webview_window("floating") {
                    if let Ok(ns_win) = win.ns_window() {
                        unsafe {
                            let raw = objc_msgSend as unsafe extern "C" fn(*const c_void, *const c_void, ...) -> *const c_void;

                            // NSWindow → NSPanel 클래스 변환 (tauri-nspanel 방식)
                            let ns_panel_cls = objc_getClass(b"NSPanel\0".as_ptr());
                            object_setClass(ns_win as *const c_void, ns_panel_cls);

                            // setFloatingPanel: YES
                            type FnSetBool  = unsafe extern "C" fn(*const c_void, *const c_void, bool);
                            let f_bool: FnSetBool = std::mem::transmute(raw);
                            let sel_fp = sel_registerName(b"setFloatingPanel:\0".as_ptr());
                            f_bool(ns_win as *const c_void, sel_fp, true);

                            // setBecomesKeyOnlyIfNeeded: NO → 항상 키 윈도우가 될 준비
                            let sel_bkn = sel_registerName(b"setBecomesKeyOnlyIfNeeded:\0".as_ptr());
                            f_bool(ns_win as *const c_void, sel_bkn, false);

                            // styleMask에 nonactivatingPanel(128) 추가
                            // 클릭 시 앱 활성화 없이 패널 표시 → 전체화면 Space에서 Space 전환 방지
                            type FnGetUsize = unsafe extern "C" fn(*const c_void, *const c_void) -> usize;
                            type FnSetUsize = unsafe extern "C" fn(*const c_void, *const c_void, usize);
                            let f_get: FnGetUsize = std::mem::transmute(raw);
                            let f_set: FnSetUsize = std::mem::transmute(raw);
                            let sel_get_style = sel_registerName(b"styleMask\0".as_ptr());
                            let sel_set_style = sel_registerName(b"setStyleMask:\0".as_ptr());
                            let style = f_get(ns_win as *const c_void, sel_get_style);
                            f_set(ns_win as *const c_void, sel_set_style, style | 128);

                            // behavior: CanJoinAllSpaces(1)|Stationary(16)|IgnoresCycle(64)|FullScreenAuxiliary(256)
                            type FnSetBeh   = unsafe extern "C" fn(*const c_void, *const c_void, usize);
                            type FnSetLevel = unsafe extern "C" fn(*const c_void, *const c_void, i64);
                            let f_beh:   FnSetBeh   = std::mem::transmute(raw);
                            let f_level: FnSetLevel = std::mem::transmute(raw);
                            let sel_beh   = sel_registerName(b"setCollectionBehavior:\0".as_ptr());
                            let sel_level = sel_registerName(b"setLevel:\0".as_ptr());
                            f_beh(ns_win as *const c_void, sel_beh, 1 | 16 | 64 | 256);
                            f_level(ns_win as *const c_void, sel_level, 1000i64); // NSScreenSaverWindowLevel
                        }
                    }
                }

                // Space 변경 감지 폴링 스레드:
                // CGSGetActiveSpace로 현재 Space ID를 200ms마다 확인해
                // Space가 바뀌면 플로팅 창을 자동으로 숨김
                let app_handle = _app.handle().clone();
                std::thread::spawn(move || {
                    let mut last_space = unsafe { CGSGetActiveSpace(CGSMainConnectionID()) };
                    loop {
                        std::thread::sleep(std::time::Duration::from_millis(200));
                        let current_space = unsafe { CGSGetActiveSpace(CGSMainConnectionID()) };
                        if current_space != last_space {
                            last_space = current_space;
                            // show_floating() 직후 600ms 이내에는 숨기지 않음
                            // (버그: activateIgnoringOtherApps가 Space를 전환시키면
                            //  폴링 스레드가 즉시 감지해 창을 숨겨버리는 현상 방지)
                            let shown_at = FLOATING_SHOWN_AT.load(std::sync::atomic::Ordering::Relaxed);
                            let now_ms = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64;
                            if now_ms.saturating_sub(shown_at) < 600 {
                                continue;
                            }
                            if let Some(win) = app_handle.get_webview_window("floating") {
                                if let Ok(true) = win.is_visible() {
                                    let _ = win.hide();
                                }
                            }
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            call_claude,
            stream_chat,
            show_floating,
            hide_floating,
            exchange_google_token,
            refresh_google_token,
            exchange_microsoft_token,
            refresh_microsoft_token,
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
                                // 키 윈도우 획득 시각 기록
                                let now = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_millis() as u64;
                                FLOATING_FOCUSED_AT.store(now, std::sync::atomic::Ordering::Relaxed);
                            }
                            tauri::WindowEvent::Focused(false) => {
                                let focused_at = FLOATING_FOCUSED_AT.load(std::sync::atomic::Ordering::Relaxed);
                                let shown_at   = FLOATING_SHOWN_AT.load(std::sync::atomic::Ordering::Relaxed);
                                let handle = app_handle.clone();
                                std::thread::spawn(move || {
                                    std::thread::sleep(std::time::Duration::from_millis(10));
                                    let now = std::time::SystemTime::now()
                                        .duration_since(std::time::UNIX_EPOCH)
                                        .unwrap_or_default()
                                        .as_millis() as u64;
                                    // 포커스 획득 후 300ms 이내 → Calendar 등 spurious 반응 → 무시
                                    if focused_at > 0 && now.saturating_sub(focused_at) < 300 {
                                        return;
                                    }
                                    // 창 표시 후 200ms 이내 → 초기 포커스 안정화 → 무시
                                    if now.saturating_sub(shown_at) < 200 {
                                        return;
                                    }
                                    if let Some(win) = handle.get_webview_window("floating") {
                                        if let Ok(true) = win.is_visible() {
                                            win.emit("floating-should-hide", ()).ok();
                                        }
                                    }
                                });
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