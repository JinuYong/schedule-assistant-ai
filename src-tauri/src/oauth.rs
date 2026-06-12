//! Google / Microsoft OAuth 토큰 교환·갱신 Rust command.
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

    if !response.status().is_success() {
        let body: serde_json::Value = response.json().await.unwrap_or_default();
        return Err(auth_error(&body));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

/// Microsoft OAuth authorization_code → tokens 교환
#[tauri::command]
pub async fn exchange_microsoft_token(
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
    // Public Client (데스크톱 앱 / localhost redirect) → client_secret 전송 금지
    // Azure Public Client 설정 시 secret을 보내면 AADSTS90023 오류 발생
    let _ = client_secret; // 사용하지 않음
    let response = client
        .post(&url)
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
            ("scope", "Tasks.ReadWrite offline_access User.Read"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let body: serde_json::Value = response.json().await.unwrap_or_default();
        return Err(oauth_error(&body, "token exchange failed"));
    }
    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

/// Microsoft access token 갱신
#[tauri::command]
pub async fn refresh_microsoft_token(
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
    let _ = client_secret; // Public Client → secret 전송 금지
    let response = client
        .post(&url)
        .form(&[
            ("refresh_token", refresh_token.as_str()),
            ("client_id", client_id.as_str()),
            ("grant_type", "refresh_token"),
            ("scope", "Tasks.ReadWrite offline_access User.Read"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let body: serde_json::Value = response.json().await.unwrap_or_default();
        return Err(auth_error(&body));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}
