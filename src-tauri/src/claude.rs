//! Claude API 호출 Rust command (CORS 우회 + 비스트리밍/스트리밍).

use tauri::Emitter;

/// Claude API 비스트리밍 호출 (일정 파싱용)
#[tauri::command]
pub async fn call_claude(
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
pub async fn stream_chat(
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
