//! 네이버 지역검색 API 호출 Rust command.
//!
//! 브라우저 fetch로는 CORS에 막히고, client secret을 프론트에 노출하지 않기 위해
//! Claude API와 같은 방식으로 Rust를 경유한다.
//!
//! 2026-06-25부터 네이버 검색 API는 개발자센터(openapi.naver.com)에서
//! NAVER API HUB(ncloud API Gateway)로 이관되었다. 구 엔드포인트는 2027-06-30까지만
//! 동작하므로 신규 엔드포인트·헤더를 사용한다.
//!   구: https://openapi.naver.com/v1/search/local.json  + X-Naver-Client-Id/Secret
//!   신: https://naverapihub.apigw.ntruss.com/search/v1/local + X-NCP-APIGW-API-KEY-ID/KEY

const LOCAL_SEARCH_URL: &str = "https://naverapihub.apigw.ntruss.com/search/v1/local";

/// 빌드 시 구워진 인증키. `build.rs`가 CI 시크릿 또는 `.env.local`에서 주입하며,
/// 비어 있으면 빌드 자체가 실패하므로 여기서는 값이 있다고 가정해도 된다.
/// 사용자가 키를 발급받게 하지 않고 앱이 자체 키로 검색한다.
const CLIENT_ID: &str = env!("NAVER_SEARCH_CLIENT_ID");
const CLIENT_SECRET: &str = env!("NAVER_SEARCH_CLIENT_SECRET");

/// 상호명/장소명으로 네이버 지역검색 → `{ items: [...] }` 원본 JSON 반환.
///
/// 응답 `items[].title`에는 검색어 강조용 `<b>` 태그가 섞여 오므로
/// 프론트엔드(`lib/naver-place.ts`)에서 제거한다.
#[tauri::command]
pub async fn search_places(query: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(LOCAL_SEARCH_URL)
        .header("X-NCP-APIGW-API-KEY-ID", CLIENT_ID)
        .header("X-NCP-APIGW-API-KEY", CLIENT_SECRET)
        // display 상한은 5다(문서 명시 1~5, 초과값은 에러 없이 5로 잘림).
        // 기본값이 1이라 생략하면 1건만 오므로 반드시 지정해야 한다.
        // sort=random이 정확도 내림차순, comment는 리뷰 개수순.
        // 검색 API 공통 한도는 하루 25,000회.
        // 문서: https://api.ncloud-docs.com/docs/naver-api-hub-search-local
        .query(&[
            ("query", query.as_str()),
            ("display", "5"),
            ("sort", "random"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // 에러 응답을 그냥 통과시키면 프론트에서 "결과 없음"으로만 보여
    // 키가 틀린 건지 결과가 없는 건지 구분되지 않는다.
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(extract_error_message(&body).unwrap_or_else(|| format!("HTTP {status}")));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

/// 에러 본문에서 사람이 읽을 메시지를 뽑는다.
///
/// API Gateway는 `{"error":{"message":...}}`, 검색 API는 `{"errorMessage":...}` 형태로
/// 응답해 형태가 갈린다. 둘 다 받아준다.
fn extract_error_message(body: &str) -> Option<String> {
    let json = serde_json::from_str::<serde_json::Value>(body).ok()?;
    let as_str = |v: Option<&serde_json::Value>| v.and_then(|v| v.as_str()).map(str::to_string);

    as_str(json.get("errorMessage"))
        .or_else(|| as_str(json.get("error").and_then(|e| e.get("message"))))
        .or_else(|| as_str(json.get("error").and_then(|e| e.get("errorMessage"))))
        .or_else(|| as_str(json.get("message")))
        .or_else(|| as_str(json.get("error")))
}

#[cfg(test)]
mod tests {
    use super::extract_error_message;

    #[test]
    fn 검색_api_형태() {
        let body = r#"{"errorMessage":"Invalid client secret","errorCode":"024"}"#;
        assert_eq!(extract_error_message(body).unwrap(), "Invalid client secret");
    }

    #[test]
    fn api_gateway_형태() {
        let body = r#"{"error":{"errorCode":"200","message":"Authentication Failed"}}"#;
        assert_eq!(extract_error_message(body).unwrap(), "Authentication Failed");
    }

    #[test]
    fn 알_수_없는_형태는_none() {
        assert!(extract_error_message("not json").is_none());
        assert!(extract_error_message(r#"{"foo":1}"#).is_none());
    }
}
