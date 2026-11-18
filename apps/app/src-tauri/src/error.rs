//! Rust command 들이 공유하는 에러 문자열 생성 헬퍼.
//!
//! 프론트엔드(auth.ts)가 `instanceof AuthError` 로 소비하는 `auth_error:{error}`
//! 포맷과, OAuth 응답 본문에서 사람이 읽을 메시지를 뽑는 로직을 한곳에 모은다.

use serde_json::Value;

/// 토큰 갱신 실패 응답 → `auth_error:{error}` 문자열.
///
/// 본문의 `error` 필드(없으면 `"unknown"`)를 추출한다.
/// auth.ts 가 이 접두사를 보고 재인증이 필요한 에러로 분기한다.
pub fn auth_error(body: &Value) -> String {
    let error = body.get("error").and_then(|e| e.as_str()).unwrap_or("unknown");
    format!("auth_error:{error}")
}

/// OAuth 토큰 교환 실패 응답 → 사람이 읽을 에러 메시지.
///
/// `error_description` → `error`(문자열) → `fallback` 순으로 추출한다.
pub fn oauth_error(body: &Value, fallback: &str) -> String {
    body.get("error_description")
        .and_then(|v| v.as_str())
        .or_else(|| body.get("error").and_then(|v| v.as_str()))
        .unwrap_or(fallback)
        .to_string()
}
