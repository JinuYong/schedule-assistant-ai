// 장소 검색(GET /places?q=). 서버가 네이버 지역검색을 대신 불러 정리한 결과만 준다 — 키는 서버에만 있다.

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

export interface PlacesResponse {
  places: PlaceResult[];
}

/** 검색어 최대 길이 */
export const PLACE_QUERY_MAX = 100;
