// 네이버 지역검색(NAVER API HUB). 키는 서버 환경 변수에만 있다 — 예전처럼 앱 바이너리에 구우면
// `strings`로 뽑혀 호출량을 남이 쓸 수 있었다.
//
// 2026-06-25부터 검색 API는 개발자센터(openapi.naver.com)에서 NAVER API HUB(ncloud API Gateway)로
// 옮겨졌다(구 엔드포인트는 2027-06-30까지). 문서: https://api.ncloud-docs.com/docs/naver-api-hub-search-local

import type { PlaceResult } from "@cali/shared";

const LOCAL_SEARCH_URL = "https://naverapihub.apigw.ntruss.com/search/v1/local";

/** 네이버가 실패를 돌려줌(키 오류·한도 초과·장애). 메시지는 로그용 */
export class NaverSearchError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "NaverSearchError";
  }
}

/**
 * 응답의 title·category에 섞여 오는 강조 태그와 HTML 엔티티를 정리한다.
 * "커피<b>&amp;</b>베이커리" → "커피&베이커리"
 */
export function stripHtmlTags(raw: string): string {
  return (
    raw
      .replace(/<[^>]*>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      // &amp; 는 마지막에 — 먼저 풀면 "&amp;lt;" 같은 이중 인코딩이 잘못 해석된다
      .replace(/&amp;/g, "&")
      .trim()
  );
}

/** 네이버 지역검색 응답 items → PlaceResult[] */
export function parsePlaceItems(raw: unknown): PlaceResult[] {
  const items = (raw as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    const o = (it ?? {}) as Record<string, unknown>;
    const str = (k: string) =>
      typeof o[k] === "string" ? (o[k] as string) : "";
    return {
      name: stripHtmlTags(str("title")),
      roadAddress: stripHtmlTags(str("roadAddress")),
      address: stripHtmlTags(str("address")),
      category: stripHtmlTags(str("category")),
    };
  });
}

/**
 * 에러 본문에서 읽을 메시지를 뽑는다. API Gateway는 `{"error":{"message":…}}`,
 * 검색 API는 `{"errorMessage":…}`로 형태가 갈린다.
 */
export function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const o = body as Record<string, unknown>;
  const err = o.error as Record<string, unknown> | string | undefined;
  const pick = (v: unknown) => (typeof v === "string" ? v : undefined);
  return (
    pick(o.errorMessage) ??
    (typeof err === "object"
      ? (pick(err?.message) ?? pick(err?.errorMessage))
      : undefined) ??
    pick(o.message) ??
    pick(err)
  );
}

export function createNaverPlaceSearch(opts: {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}) {
  const doFetch = opts.fetch ?? fetch;
  return async (query: string): Promise<PlaceResult[]> => {
    const url = new URL(LOCAL_SEARCH_URL);
    url.searchParams.set("query", query);
    // display 상한은 5(넘겨도 5로 잘림). 기본값이 1이라 꼭 지정한다. sort=random이 정확도순
    url.searchParams.set("display", "5");
    url.searchParams.set("sort", "random");
    const res = await doFetch(url, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": opts.clientId,
        "X-NCP-APIGW-API-KEY": opts.clientSecret,
      },
      signal: AbortSignal.timeout(8000),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok)
      throw new NaverSearchError(
        res.status,
        extractErrorMessage(body) ?? `HTTP ${res.status}`,
      );
    return parsePlaceItems(body);
  };
}
