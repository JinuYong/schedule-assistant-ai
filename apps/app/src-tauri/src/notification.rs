/// 데스크탑 알림 전송.
///
/// macOS 26(Tahoe)에서는 tauri-plugin-notification이 쓰는 구형 NSUserNotification이
/// 동작하지 않아(권한 프롬프트도 없고 조용히 드롭됨), osascript의 `display notification`으로
/// 보낸다. 서명 없이도 동작하지만 발신자는 "스크립트 편집기"로 표시되는 한계가 있다.
/// (앱 이름으로 표시하려면 정식 Developer ID 서명 + UNUserNotificationCenter 필요)
#[tauri::command]
pub fn send_os_notification(title: String, body: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // 스크립트에 argv로 전달해 따옴표/특수문자 이스케이프 문제를 피한다.
        let script = "on run {t, b}\ndisplay notification b with title t\nend run";
        Command::new("osascript")
            .arg("-e")
            .arg(script)
            .arg(&title)
            .arg(&body)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (&title, &body);
    }
    Ok(())
}
