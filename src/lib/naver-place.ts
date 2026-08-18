import { invoke } from "@tauri-apps/api/core";
import { storeGet, isTauri } from "./tauri-store";

export const NAVER_CLIENT_ID_KEY = "naver.searchClientId";
export const NAVER_CLIENT_SECRET_KEY = "naver.searchClientSecret";

export interface PlaceResult {
  /** 상호명 (강조 태그·엔티티 정리됨) */
  name: string;
  /** 도로명주소 — 없으면 빈 문자열 */
  roadAddress: string;
  /** 지번주소 */
  address: string;
  /** "음식점>카페" 같은 분류 */
  category: string;
}

/**
 * 네이버 검색 API 응답의 title/category에 섞여 오는 강조 태그와 HTML 엔티티를 정리한다.
 * "커피<b>&amp;</b>베이커리" → "커피&베이커리"
 */
export function stripHtmlTags(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    // &amp; 는 마지막에 — 먼저 풀면 "&amp;lt;" 같은 이중 인코딩이 잘못 해석된다
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * 검색 결과 → Google Calendar location 문자열.
 *
 * "상호명, 도로명주소" 형태로 합친다. Google Calendar가 장소를 자동완성할 때 쓰는
 * 형식과 같아서, 리스트에서는 parseLocationLabel이 상호명만 뽑아 보여주고
 * 상세에서는 전체가 보이며, 지도 검색은 상호명까지 포함해 정확히 그 지점에 떨어진다.
 */
export function toLocationString(place: PlaceResult): string {
  const addr = place.roadAddress || place.address;
  if (!place.name) return addr;
  if (!addr) return place.name;
  return `${place.name}, ${addr}`;
}

/** 네이버 지역검색 응답 items → PlaceResult[] */
export function parsePlaceItems(raw: unknown): PlaceResult[] {
  const items = (raw as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    const o = (it ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
    return {
      name: stripHtmlTags(str("title")),
      roadAddress: stripHtmlTags(str("roadAddress")),
      address: stripHtmlTags(str("address")),
      category: stripHtmlTags(str("category")),
    };
  });
}

/**
 * 상호명/장소명으로 네이버 지역검색.
 *
 * 키는 설정 화면에서 입력해 tauri-store에 저장된 값을 쓴다.
 * 키가 없으면 안내 메시지를 담은 Error를 던진다.
 */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim();
  if (!q) return [];
  if (!isTauri()) {
    throw new Error("장소 검색은 앱 환경에서만 동작합니다.");
  }

  const [clientId, clientSecret] = await Promise.all([
    storeGet<string>(NAVER_CLIENT_ID_KEY),
    storeGet<string>(NAVER_CLIENT_SECRET_KEY),
  ]);

  if (!clientId || !clientSecret) {
    throw new Error("네이버 검색 API 키가 없습니다. 설정 → API 키 설정에서 입력하세요.");
  }

  const raw = await invoke("search_places", { clientId, clientSecret, query: q });
  return parsePlaceItems(raw);
}
