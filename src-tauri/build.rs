use std::path::Path;

fn main() {
    embed_naver_keys();
    tauri_build::build()
}

/// NAVER API HUB 키를 컴파일 타임에 바이너리로 굽는다.
///
/// 우선순위는 빌드 환경변수 > 리포지토리 루트 `.env.local`이다.
/// CI에서는 리포지토리 시크릿이 환경변수로, 로컬에서는 `.env.local`로 들어온다.
///
/// **키가 없으면 빌드를 실패시킨다.** 사용자가 키를 입력할 통로가 없으므로,
/// 키 없이 빌드된 앱은 장소 검색이 조용히 죽은 채로 배포된다. 그 상태를 만드느니
/// 빌드 단계에서 끊는 편이 낫다.
///
/// JS 번들(`NEXT_PUBLIC_*`) 대신 Rust 바이너리에 굽는 이유는 평문 노출을 조금이라도
/// 줄이기 위해서다. 다만 `strings`로 추출 가능하다는 점은 동일하므로,
/// 이 키는 "숨겨진 비밀"이 아니라 "유출되면 호출량이 소진되는 값"으로 취급하고
/// ncloud 콘솔에서 호출량 임계치를 걸어 손실 상한을 고정해 둔다.
fn embed_naver_keys() {
    const KEYS: [&str; 2] = ["NAVER_SEARCH_CLIENT_ID", "NAVER_SEARCH_CLIENT_SECRET"];

    println!("cargo:rerun-if-changed=../.env.local");
    let dotenv = std::fs::read_to_string(Path::new("../.env.local")).unwrap_or_default();

    for key in KEYS {
        println!("cargo:rerun-if-env-changed={key}");
        let value = std::env::var(key)
            .ok()
            .filter(|v| !v.trim().is_empty())
            .or_else(|| lookup_dotenv(&dotenv, key))
            .unwrap_or_else(|| {
                panic!(
                    "\n\n  {key} 가 비어 있어 빌드를 중단합니다.\n  \
                     로컬: 리포지토리 루트 .env.local 에 채우세요.\n  \
                     CI:   리포지토리 시크릿({key})을 등록하세요.\n  \
                     발급: ncloud.com → NAVER API HUB → 인증키\n"
                )
            });
        println!("cargo:rustc-env={key}={value}");
    }
}

/// `.env.local`에서 `KEY=value` 한 줄을 찾는다. 주석(`#`)과 감싼 따옴표를 처리한다.
fn lookup_dotenv(contents: &str, key: &str) -> Option<String> {
    contents.lines().find_map(|line| {
        let line = line.trim();
        if line.starts_with('#') {
            return None;
        }
        let (k, v) = line.split_once('=')?;
        if k.trim() != key {
            return None;
        }
        let v = v.trim().trim_matches(['"', '\'']).trim().to_string();
        if v.is_empty() { None } else { Some(v) }
    })
}
