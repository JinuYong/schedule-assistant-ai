import { isTauri } from "./tauri-store";

/**
 * Google Calendar 자유 입력 장소 문자열 → 리스트 표시용 간결 라벨.
 * 쉼표로 구분된 경우 첫 세그먼트(장소명)만 취하고, "대한민국"/우편번호 같은
 * 군더더기 접두어를 제거한다. 지오코딩에는 원본 전체를 쓰는 게 정확하므로
 * 이 함수는 표시 용도로만 사용한다.
 */
export function parseLocationLabel(raw: string): string {
  const first = raw.split(",")[0]?.trim() ?? "";
  // 선두의 국가/우편번호 군더더기 제거 ("대한민국 서울..." → "서울...")
  const cleaned = first
    .replace(/^(대한민국|South Korea)\s+/i, "")
    .replace(/^\d{5}\s+/, "");
  return cleaned || raw.trim();
}

/**
 * 지도에서 찾을 수 있는 장소인지 — 주소로 보이는 신호가 있는지 판별한다.
 * "회의실 A", "집", "온라인" 같은 일반 장소에는 지도 링크를 노출하지 않기 위한 용도.
 *
 * 상호명만 있는 경우("스타벅스 강남점")도 false다. 이때는 일정 폼의 장소 검색으로
 * 실제 주소를 채운 뒤 링크가 나타나는 흐름을 의도했다.
 */
export function isMappableLocation(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;

  // 5자리 우편번호
  if (/\b\d{5}\b/.test(s)) return true;

  // 행정구역 접미사 ("서울특별시 …", "경기도 …", "제주특별자치도 …")
  if (/(특별시|광역시|특별자치시|특별자치도)/.test(s)) return true;
  if (/[가-힣]{2,}도\s+[가-힣]+(시|군|구)/.test(s)) return true;

  // 도로명 + 건물번호 ("테헤란로 123", "세종대로 110", "판교역로 235")
  if (/[가-힣A-Za-z0-9]+(로|길)\s*\d+/.test(s)) return true;

  // 지번 ("역삼동 737", "삼평동 681-4") — 앞이 한글이어야 함("2동 305" 같은 동호수 제외)
  if (/[가-힣]{2,}(동|읍|면|리)\s*\d+(-\d+)?/.test(s)) return true;

  // 시/군/구 + 뒤에 무언가 더 있음 ("강남구 역삼동")
  if (/[가-힣]{2,}(시|군|구)\s+\S/.test(s)) return true;

  // 영문 주소 ("123 Main St", "1 Infinite Loop Rd")
  if (/\d+\s+[A-Za-z][\w\s]*\b(St|Street|Rd|Road|Ave|Avenue|Blvd|Dr|Drive|Ln|Lane)\b/i.test(s)) return true;

  return false;
}

/** 장소 문자열에 대한 네이버지도 검색 URL. */
export function naverMapSearchUrl(query: string): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(query.trim())}`;
}

/** 장소 문자열로 네이버지도 검색을 시스템 브라우저에서 연다. */
export async function openNaverMap(query: string): Promise<void> {
  const url = naverMapSearchUrl(query);
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}
