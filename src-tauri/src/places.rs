//! 네이버 지역검색 API 호출 Rust command.
//!
//! 브라우저 fetch로는 CORS에 막히고, client secret을 프론트에 노출하지 않기 위해
//! Claude API와 같은 방식으로 Rust를 경유한다.

/// 상호명/장소명으로 네이버 지역검색 → `{ items: [...] }` 원본 JSON 반환.
///
/// 응답 `items[].title`에는 검색어 강조용 `<b>` 태그가 섞여 오므로
/// 프론트엔드(`lib/naver-place.ts`)에서 제거한다.
#[tauri::command]
pub async fn search_places(
    client_id: String,
    client_secret: String,
    query: String,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://openapi.naver.com/v1/search/local.json")
        .header("X-Naver-Client-Id", &client_id)
        .header("X-Naver-Client-Secret", &client_secret)
        // display는 지역검색 API 상한이 5다. sort=random이 정확도순.
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
        let msg = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|j| {
                j.get("errorMessage")
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(msg);
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}
