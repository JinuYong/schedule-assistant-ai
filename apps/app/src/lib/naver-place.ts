import { PLACE_QUERY_MAX, type PlaceResult } from "@cali/shared";
import { api, ApiRequestError } from "@/lib/api";
import { MOCK_ENABLED } from "@/lib/dev-mock";
import { useAccountStore } from "@/store/account";

export type { PlaceResult };

/**
 * 검색 결과 → Google Calendar location 문자열.
 *
 * "상호명, 도로명주소" 형태로 합친다. Google Calendar가 장소를 자동완성할 때 쓰는
 * 형식과 같아서, 리스트에서는 parseLocationLabel이 상호명만 뽑아 보여주고
 * 상세에서는 전체가 보이며, 지도 검색은 상호명까지 포함해 정확히 그 지점에 떨어진다.
 */
export function toLocationString(place: PlaceResult): string {
  // 층·호수("지상1층 102호")도 그대로 남긴다 — 실제로 찾아갈 때 필요한 정보다.
  // 네이버지도 검색을 깨뜨리는 문제는 링크를 만드는 naverMapSearchUrl에서 처리한다.
  const addr = place.roadAddress || place.address;
  if (!place.name) return addr;
  if (!addr) return place.name;
  return `${place.name}, ${addr}`;
}

const PLACE_ERRORS: Partial<Record<string, string>> = {
  rate_limited: "오늘 장소 검색을 너무 많이 했어요. 내일 다시 시도해 주세요.",
  unavailable: "지금은 장소 검색을 쓸 수 없어요.",
  upstream_error:
    "네이버 장소 검색이 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.",
};

/**
 * 상호명/장소명으로 네이버 지역검색. Cali 서버가 대신 부른다(`GET /places`) —
 * 인증키는 서버에만 있어 앱 파일에서 뽑아낼 수 없다.
 */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim();
  if (!q) return [];
  if (MOCK_ENABLED) return mockPlaces(q);
  const token = useAccountStore.getState().session?.token;
  if (!token) throw new Error("로그인이 필요합니다.");
  try {
    return (await api.places(token, q.slice(0, PLACE_QUERY_MAX))).places;
  } catch (e) {
    const message =
      e instanceof ApiRequestError && e.code ? PLACE_ERRORS[e.code] : undefined;
    throw message ? new Error(message) : e;
  }
}

/** 더미 모드(브라우저 개발)용 결과 */
function mockPlaces(q: string): PlaceResult[] {
  return [
    {
      name: `${q} 강남점`,
      roadAddress: "서울특별시 강남구 테헤란로 123",
      address: "서울특별시 강남구 역삼동 737",
      category: "음식점>카페",
    },
    {
      name: `${q} 역삼점`,
      roadAddress: "",
      address: "서울특별시 강남구 역삼동 825",
      category: "음식점>카페",
    },
  ];
}
