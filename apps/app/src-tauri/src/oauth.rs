//! Google OAuth 토큰 교환·갱신 Rust command.
//!
//! client_secret 보호 + CORS 차단을 위해 토큰 교환은 모두 Rust 경유.

use crate::error::{auth_error, oauth_error};

/// Google OAuth authorization_code → tokens 교환
#[tauri::command]
pub async fn exchange_google_token(
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

    // 상태 코드를 보지 않으면 400 응답 본문(access_token 없는 에러 JSON)이
    // 성공처럼 프론트로 넘어가 그대로 저장된다.
    if !response.status().is_success() {
        let body: serde_json::Value = response.json().await.unwrap_or_default();
        return Err(oauth_error(&body, "token exchange failed"));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

/// Google access token 갱신
#[tauri::command]
pub async fn refresh_google_token(
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

    let status = response.status();
    if !status.is_success() {
        let body: serde_json::Value = response.json().await.unwrap_or_default();
        // 400·401(invalid_grant 등)만 "다시 로그인해야 함"이다 — 프론트가 이걸 보고 토큰을 지운다.
        // Google 쪽 일시 장애(5xx)·429까지 auth_error로 보내면 멀쩡한 연결이 끊긴다.
        if status.as_u16() == 400 || status.as_u16() == 401 {
            return Err(auth_error(&body));
        }
        return Err(format!(
            "Google 토큰 갱신 실패 ({status}): {}",
            oauth_error(&body, "잠시 후 다시 시도해 주세요")
        ));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}
