//! 플로팅(컴패니언) 창 제어 — macOS NSPanel 기반.
//!
//! 핵심 지식은 CLAUDE.md "컴패니언 윈도우 (floating)" 섹션 참고.
//! macOS 외 플랫폼에서는 단순 show/hide 로 폴백한다.

use tauri::{Emitter, Manager};

#[cfg(target_os = "macos")]
use std::ffi::c_void;

/// floating 창이 마지막으로 Focused(true)가 된 시각 (ms)
static FLOATING_FOCUSED_AT: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);

/// show_floating() 이 마지막으로 호출된 시각 (ms)
static FLOATING_SHOWN_AT: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);

/// 창 표시 직전 frontmost 앱 포인터 (NSRunningApplication*, retained)
/// ESC 닫기 시 해당 앱으로 포커스 복원 → Space 전환 방지
static PREV_APP: std::sync::atomic::AtomicUsize =
    std::sync::atomic::AtomicUsize::new(0);

// macOS 시스템 API — 모듈 레벨 통합 선언 (중복/unused 경고 방지)
#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn sel_registerName(name: *const u8) -> *const c_void;
    fn objc_getClass(name: *const u8) -> *const c_void;
    fn objc_msgSend(receiver: *const c_void, sel: *const c_void, ...) -> *const c_void;
    fn object_setClass(obj: *const c_void, cls: *const c_void) -> *const c_void;
    fn objc_allocateClassPair(superclass: *const c_void, name: *const u8, extra: usize) -> *const c_void;
    fn class_addMethod(cls: *const c_void, sel: *const c_void, imp: *const c_void, types: *const u8) -> bool;
    fn objc_registerClassPair(cls: *const c_void);
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

/// 플로팅 패널 collection behavior:
/// CanJoinAllSpaces(1)|Stationary(16)|IgnoresCycle(64)|FullScreenAuxiliary(256)
/// → 전체화면 Space 포함 모든 Space에 표시
#[cfg(target_os = "macos")]
const PANEL_BEHAVIOR: usize = 1 | 16 | 64 | 256;

/// 플로팅 패널 윈도우 레벨 (NSScreenSaverWindowLevel)
#[cfg(target_os = "macos")]
const PANEL_LEVEL: i64 = 1000;

/// KeyablePanel 서브클래스: canBecomeKeyWindow → YES 오버라이드
/// tauri-nspanel / ChatGPT 데스크톱 방식
/// object_setClass 만으로는 canBecomeKeyWindow 가 NO 를 반환할 수 있어
/// makeKeyWindow 가 조용히 무시되고 키보드 이벤트가 전달되지 않음
#[cfg(target_os = "macos")]
extern "C" fn panel_can_become_key(_self: *const c_void, _cmd: *const c_void) -> bool {
    true
}

/// 현재 시각을 UNIX epoch 기준 ms로 반환
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// 플로팅 창을 현재 Space + 커서가 있는 모니터 중앙에 표시
///
/// - NSEvent.mouseLocation + NSScreen: Cocoa 좌표계에서 직접 커서/모니터 감지 (JS보다 정확)
/// - NSPanel (nonactivatingPanel) + CanJoinAllSpaces|Stationary|IgnoresCycle|FullScreenAuxiliary: 전체화면 Space에 표시
/// - activate() + nonactivatingPanel(128) + main CanJoinAllSpaces: Space 전환 없이 키보드 포커스 획득
#[tauri::command]
pub fn show_floating(_app: tauri::AppHandle) -> Result<(), String> {
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
        FLOATING_SHOWN_AT.store(now_ms(), std::sync::atomic::Ordering::Relaxed);

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
            f_set_beh(ns_win as *const c_void, sel_beh, PANEL_BEHAVIOR);
            f_set_level(ns_win as *const c_void, sel_level, PANEL_LEVEL);

            // B-pre. 창이 숨겨진 상태일 때만 이전 frontmost 앱 저장 (ESC 닫기 시 복원용)
            //        창이 이미 보이는 상태면 저장하지 않음 (이미 우리 앱이 frontmost이므로)
            if !window.is_visible().unwrap_or(true) {
                let ns_workspace = objc_getClass(b"NSWorkspace\0".as_ptr());
                let shared = objc_msgSend(ns_workspace, sel_registerName(b"sharedWorkspace\0".as_ptr()));
                let front_app = objc_msgSend(shared, sel_registerName(b"frontmostApplication\0".as_ptr()));
                if !front_app.is_null() {
                    type FnRetain = unsafe extern "C" fn(*const c_void, *const c_void) -> *const c_void;
                    let f_r: FnRetain = std::mem::transmute(raw);
                    f_r(front_app, sel_registerName(b"retain\0".as_ptr()));
                    let old = PREV_APP.swap(front_app as usize, std::sync::atomic::Ordering::SeqCst);
                    if old != 0 {
                        type FnVoidObj = unsafe extern "C" fn(*const c_void, *const c_void);
                        let f_rel: FnVoidObj = std::mem::transmute(raw);
                        f_rel(old as *const c_void, sel_registerName(b"release\0".as_ptr()));
                    }
                }
            }

            // B. orderFrontRegardless: 포커스·키 윈도우 변경 없이 창만 현재 Space에 표시
            type FnVoidSel = unsafe extern "C" fn(*const c_void, *const c_void);
            let f_void: FnVoidSel = std::mem::transmute(raw);
            let sel_ofr = sel_registerName(b"orderFrontRegardless\0".as_ptr());
            f_void(ns_win as *const c_void, sel_ofr);

            // C. makeKeyAndOrderFront:nil
            //    - activateIgnoringOtherApps:YES 제거: 다른 Space의 앱(Calendar 등)을 강제로
            //      앞으로 끌어내는 부작용 발생 → Calendar 같은 앱이 튀어나오는 문제
            //    - makeKeyAndOrderFront: 는 내부적으로 앱 활성화 + IMK 초기화 경로를 포함
            //      → 별도 activateIgnoringOtherApps 없이도 키보드 입력 작동
            type FnMKOF = unsafe extern "C" fn(*const c_void, *const c_void, *const c_void);
            let f_mkof: FnMKOF = std::mem::transmute(raw);
            f_mkof(ns_win as *const c_void, sel_registerName(b"makeKeyAndOrderFront:\0".as_ptr()), std::ptr::null());
        }

        // 프론트엔드에 표시 알림 → ESC 글로벌 단축키 등록
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
/// restore=true (ESC): 이전 앱 활성화 후 숨김 → Space 전환 없이 원위치 복원
/// restore=false (클릭 아웃): 이미 다른 앱이 포커스를 받았으므로 그냥 숨김
#[tauri::command]
pub fn hide_floating(app: tauri::AppHandle, restore: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let prev = PREV_APP.swap(0, std::sync::atomic::Ordering::SeqCst);
        if prev != 0 {
            unsafe {
                let raw = objc_msgSend
                    as unsafe extern "C" fn(*const c_void, *const c_void, ...) -> *const c_void;
                let prev_app = prev as *const c_void;
                if restore {
                    // ESC: 이전 앱을 명시적으로 활성화 → 해당 앱의 Space로 자연스럽게 복귀
                    type FnAct = unsafe extern "C" fn(*const c_void, *const c_void, usize);
                    let f: FnAct = std::mem::transmute(raw);
                    f(prev_app, sel_registerName(b"activateWithOptions:\0".as_ptr()), 0usize);
                }
                type FnRel = unsafe extern "C" fn(*const c_void, *const c_void);
                let f_rel: FnRel = std::mem::transmute(raw);
                f_rel(prev_app, sel_registerName(b"release\0".as_ptr()));
            }
        }
    }
    if let Some(win) = app.get_webview_window("floating") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 메인 단축키를 새 값으로 교체 (설정에서 변경 시)
/// Rust 레벨에서 등록하므로 WebView 재로드(HMR)와 무관하게 영구 동작
#[tauri::command]
pub fn set_global_shortcut(app: tauri::AppHandle, old: String, new: String) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
    if !old.is_empty() {
        app.global_shortcut().unregister(old.as_str()).ok();
    }
    let app_handle = app.clone();
    app.global_shortcut()
        .on_shortcut(new.as_str(), move |_app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                show_floating(app_handle.clone()).ok();
            }
        })
        .map_err(|e| e.to_string())
}

/// 저장된 hotkey 값으로 메인 전역 단축키를 Rust 레벨에서 초기 등록.
/// → WebView HMR 재로드 시에도 JS 콜백 ID 문제 없이 영구 동작
pub fn register_global_shortcut(app: &tauri::App) {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
    use tauri_plugin_store::StoreExt;
    let shortcut_str = match app.handle().store("app-store.json") {
        Ok(store) => store
            .get("hotkey")
            .and_then(|v: serde_json::Value| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "Option+Space".to_string()),
        Err(_) => "Option+Space".to_string(),
    };
    let app_handle = app.handle().clone();
    app.global_shortcut()
        .on_shortcut(shortcut_str.as_str(), move |_app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                show_floating(app_handle.clone()).ok();
            }
        })
        .ok();
}

/// macOS 전용 창 setup: floating 창을 NSPanel(KeyablePanel)로 변환 + behavior/level 초기 설정,
/// main 창 CanJoinAllSpaces 설정, Space 변경 감지 폴링 스레드 시작.
/// macOS 외 플랫폼에서는 아무 동작도 하지 않는다.
pub fn setup(app: &tauri::App) {
    #[cfg(target_os = "macos")]
    {
        // 플로팅 창을 NSPanel(non-activating)로 변환 + behavior/level 초기 설정
        //
        // NSPanel (nonactivatingPanel): 앱 활성화 없이 makeKeyWindow로 키 윈도우 획득 → 키보드 입력 가능
        //   orderFrontRegardless → makeKeyWindow 순서로 Space 전환 없이 활성화
        if let Some(win) = app.get_webview_window("floating") {
            if let Ok(ns_win) = win.ns_window() {
                unsafe {
                    let raw = objc_msgSend as unsafe extern "C" fn(*const c_void, *const c_void, ...) -> *const c_void;

                    // KeyablePanel = NSPanel 서브클래스 + canBecomeKeyWindow → YES
                    // object_setClass(NSPanel) 만으로는 canBecomeKeyWindow 가 NO 를 반환,
                    // makeKeyWindow 가 무시되어 키보드 입력이 전달되지 않음 (ChatGPT/tauri-nspanel 방식으로 수정)
                    let ns_panel_cls = objc_getClass(b"NSPanel\0".as_ptr());
                    let kp_cls = objc_allocateClassPair(ns_panel_cls, b"KeyablePanel\0".as_ptr(), 0);
                    if !kp_cls.is_null() {
                        let sel_cbkw = sel_registerName(b"canBecomeKeyWindow\0".as_ptr());
                        class_addMethod(kp_cls, sel_cbkw, panel_can_become_key as *const c_void, b"B@:\0".as_ptr());
                        objc_registerClassPair(kp_cls);
                    }
                    let target_cls = if kp_cls.is_null() { ns_panel_cls } else { kp_cls };
                    object_setClass(ns_win as *const c_void, target_cls);

                    // setFloatingPanel: YES
                    type FnSetBool  = unsafe extern "C" fn(*const c_void, *const c_void, bool);
                    let f_bool: FnSetBool = std::mem::transmute(raw);
                    let sel_fp = sel_registerName(b"setFloatingPanel:\0".as_ptr());
                    f_bool(ns_win as *const c_void, sel_fp, true);

                    // setBecomesKeyOnlyIfNeeded: NO → 항상 키 윈도우가 될 준비
                    let sel_bkn = sel_registerName(b"setBecomesKeyOnlyIfNeeded:\0".as_ptr());
                    f_bool(ns_win as *const c_void, sel_bkn, false);

                    // nonactivatingPanel(128): 전체화면 Space에서 Space 전환 없이 패널 표시
                    // activateIgnoringOtherApps + nonactivatingPanel 조합 → Space 전환 억제
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
                    f_beh(ns_win as *const c_void, sel_beh, PANEL_BEHAVIOR);
                    f_level(ns_win as *const c_void, sel_level, PANEL_LEVEL);
                }
            }
        }

        // 메인 창 CanJoinAllSpaces(1) 설정
        // → activate() 시 macOS가 "메인 창이 현재 Space에 있다"고 인식 → Space 전환 없음
        if let Some(main_win) = app.get_webview_window("main") {
            if let Ok(main_ns) = main_win.ns_window() {
                unsafe {
                    let raw = objc_msgSend as unsafe extern "C" fn(*const c_void, *const c_void, ...) -> *const c_void;
                    type FnSetBeh = unsafe extern "C" fn(*const c_void, *const c_void, usize);
                    let f: FnSetBeh = std::mem::transmute(raw);
                    let sel_beh = sel_registerName(b"setCollectionBehavior:\0".as_ptr());
                    f(main_ns as *const c_void, sel_beh, 1); // CanJoinAllSpaces
                }
            }
        }

        // Space 변경 감지 폴링 스레드:
        // CGSGetActiveSpace로 현재 Space ID를 200ms마다 확인해
        // Space가 바뀌면 플로팅 창을 자동으로 숨김
        let app_handle = app.handle().clone();
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
                    if now_ms().saturating_sub(shown_at) < 600 {
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

    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

/// floating 창 Focused(true) 이벤트 처리.
/// makeKeyAndOrderFront: 로 IMK가 설정된 시점 → input.focus() 호출이 가장 신뢰할 수 있음
pub fn on_floating_focused(app: &tauri::AppHandle) {
    FLOATING_FOCUSED_AT.store(now_ms(), std::sync::atomic::Ordering::Relaxed);

    // makeKeyAndOrderFront: 로 IMK가 설정된 후 Focused(true) 발화
    // → 이 시점에 input.focus() 호출하면 IMK 연결 상태에서 포커스 가능
    if let Some(win) = app.get_webview_window("floating") {
        win.eval("var i=document.querySelector('input:not([disabled])');if(i)i.focus();").ok();
    }
}

/// floating 창 Focused(false) 이벤트 처리.
/// spurious 포커스 변화(Calendar 등)와 초기 안정화 구간을 필터링한 뒤
/// 프론트엔드에 "floating-should-hide" emit
pub fn on_floating_unfocused(app: &tauri::AppHandle) {
    let focused_at = FLOATING_FOCUSED_AT.load(std::sync::atomic::Ordering::Relaxed);
    let shown_at   = FLOATING_SHOWN_AT.load(std::sync::atomic::Ordering::Relaxed);
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(10));
        let now = now_ms();
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
