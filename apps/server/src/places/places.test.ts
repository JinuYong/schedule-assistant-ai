import { describe, expect, it, test } from "bun:test";
import type { PlaceResult, PlacesResponse } from "@cali/shared";
import { createApp } from "../app";
import { createMemoryAuthStore } from "../auth/memory-store";
import { startSession } from "../auth/session";
import { createMemoryMemoStore } from "../memos/memory-store";
import { createMemoryTodoStore } from "../todos/memory-store";
import {
  createNaverPlaceSearch,
  extractErrorMessage,
  NaverSearchError,
  parsePlaceItems,
  stripHtmlTags,
} from "./naver";
import type { PlaceDeps } from "./routes";

describe("stripHtmlTags", () => {
  it("검색어 강조 태그를 제거한다", () => {
    expect(stripHtmlTags("<b>스타벅스</b> 역삼역점")).toBe("스타벅스 역삼역점");
  });

  it("HTML 엔티티를 복원한다", () => {
    expect(stripHtmlTags("커피&amp;베이커리")).toBe("커피&베이커리");
    expect(stripHtmlTags("&quot;맛집&quot;")).toBe('"맛집"');
    expect(stripHtmlTags("Joe&#39;s Pizza")).toBe("Joe's Pizza");
    expect(stripHtmlTags("A&nbsp;B")).toBe("A B");
  });

  it("태그와 엔티티가 섞여 있어도 정리한다", () => {
    expect(stripHtmlTags("커피<b>&amp;</b>베이커리")).toBe("커피&베이커리");
  });

  it("이중 인코딩된 엔티티를 잘못 해석하지 않는다", () => {
    // &amp;lt; 는 리터럴 "&lt;" 를 의미하므로 "<" 가 되어선 안 된다
    expect(stripHtmlTags("&amp;lt;")).toBe("&lt;");
  });

  it("앞뒤 공백을 정리한다", () => {
    expect(stripHtmlTags("  <b>카페</b>  ")).toBe("카페");
  });
});

describe("parsePlaceItems", () => {
  it("items를 PlaceResult로 변환하며 태그를 제거한다", () => {
    const raw = {
      items: [
        {
          title: "<b>스타벅스</b> 역삼역점",
          roadAddress: "서울특별시 강남구 테헤란로 123",
          address: "서울특별시 강남구 역삼동 737",
          category: "음식점>카페",
          telephone: "",
        },
      ],
    };
    expect(parsePlaceItems(raw)).toEqual([
      {
        name: "스타벅스 역삼역점",
        roadAddress: "서울특별시 강남구 테헤란로 123",
        address: "서울특별시 강남구 역삼동 737",
        category: "음식점>카페",
      },
    ]);
  });

  it("items가 없거나 형태가 다르면 빈 배열", () => {
    expect(parsePlaceItems(null)).toEqual([]);
    expect(parsePlaceItems({})).toEqual([]);
    expect(parsePlaceItems({ items: "nope" })).toEqual([]);
  });

  it("필드가 빠진 항목도 빈 문자열로 채운다", () => {
    expect(parsePlaceItems({ items: [{ title: "카페" }] })).toEqual([
      { name: "카페", roadAddress: "", address: "", category: "" },
    ]);
  });
});

describe("extractErrorMessage", () => {
  it("검색 API 형태", () => {
    expect(
      extractErrorMessage({
        errorMessage: "Invalid client secret",
        errorCode: "024",
      }),
    ).toBe("Invalid client secret");
  });

  it("API Gateway 형태", () => {
    expect(
      extractErrorMessage({
        error: { errorCode: "200", message: "Authentication Failed" },
      }),
    ).toBe("Authentication Failed");
  });

  it("알 수 없는 형태는 undefined", () => {
    expect(extractErrorMessage("not json")).toBeUndefined();
    expect(extractErrorMessage({ foo: 1 })).toBeUndefined();
  });
});

describe("createNaverPlaceSearch", () => {
  test("키를 헤더로, 검색어·5건·정확도순을 쿼리로 보낸다", async () => {
    let seen: Request | undefined;
    const search = createNaverPlaceSearch({
      clientId: "id",
      clientSecret: "secret",
      fetch: (async (url: URL, init: RequestInit) => {
        seen = new Request(url.toString(), init);
        return Response.json({ items: [{ title: "<b>카페</b>" }] });
      }) as unknown as typeof fetch,
    });
    expect(await search("카페 강남")).toEqual([
      { name: "카페", roadAddress: "", address: "", category: "" },
    ]);
    const url = new URL(seen!.url);
    expect(url.searchParams.get("query")).toBe("카페 강남");
    expect(url.searchParams.get("display")).toBe("5");
    expect(url.searchParams.get("sort")).toBe("random");
    expect(seen!.headers.get("X-NCP-APIGW-API-KEY-ID")).toBe("id");
    expect(seen!.headers.get("X-NCP-APIGW-API-KEY")).toBe("secret");
  });

  test("실패 응답은 NaverSearchError", async () => {
    const search = createNaverPlaceSearch({
      clientId: "id",
      clientSecret: "bad",
      fetch: (async () =>
        Response.json(
          { error: { message: "Authentication Failed" } },
          { status: 401 },
        )) as unknown as typeof fetch,
    });
    const err = await search("x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NaverSearchError);
    expect((err as NaverSearchError).message).toBe("Authentication Failed");
  });
});

describe("GET /places", () => {
  const place: PlaceResult = {
    name: "카페",
    roadAddress: "서울 강남구 테헤란로 1",
    address: "",
    category: "카페",
  };

  async function setup(places: PlaceDeps) {
    const auth = createMemoryAuthStore();
    const clock = new Date("2026-11-25T00:00:00.000Z");
    const app = createApp({
      corsOrigins: [],
      checkDb: async () => {},
      auth: {
        store: auth,
        verifyGoogle: async () => {
          throw new Error("안 부른다");
        },
        now: () => clock,
      },
      todos: { store: createMemoryTodoStore() },
      memos: { store: createMemoryMemoStore() },
      places,
    });
    const signIn = async (sub: string) => {
      const user = await auth.upsertGoogleUser(
        { sub, email: `${sub}@example.com`, name: null, pictureUrl: null },
        clock,
      );
      return startSession(auth, user.id, clock);
    };
    const get = (token: string | null, q: string) =>
      app.request(`/places?q=${encodeURIComponent(q)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    return { get, signIn };
  }

  test("로그인해야 쓴다", async () => {
    const { get } = await setup({ search: async () => [place] });
    expect((await get(null, "카페")).status).toBe(401);
  });

  test("결과를 돌려주고, 같은 검색어는 네이버를 다시 부르지 않는다", async () => {
    let calls = 0;
    const { get, signIn } = await setup({
      search: async () => {
        calls++;
        return [place];
      },
    });
    const me = await signIn("me");
    const res = await get(me, "카페");
    expect(res.status).toBe(200);
    expect((await res.json()) as PlacesResponse).toEqual({ places: [place] });
    await get(me, " 카페 ");
    expect(calls).toBe(1);
  });

  test("빈 검색어·너무 긴 검색어는 400", async () => {
    const { get, signIn } = await setup({ search: async () => [] });
    const me = await signIn("me");
    expect((await get(me, "  ")).status).toBe(400);
    expect((await get(me, "가".repeat(101))).status).toBe(400);
  });

  test("서버에 키가 없으면 503", async () => {
    const { get, signIn } = await setup({});
    expect((await get(await signIn("me"), "카페")).status).toBe(503);
  });

  test("네이버가 실패하면 502", async () => {
    const { get, signIn } = await setup({
      search: async () => {
        throw new NaverSearchError(500, "down");
      },
    });
    expect((await get(await signIn("me"), "카페")).status).toBe(502);
  });

  test("사용자마다 하루 한도를 넘으면 429, 다른 사용자는 그대로", async () => {
    const { get, signIn } = await setup({
      search: async () => [place],
      dailyLimit: 2,
    });
    const me = await signIn("me");
    expect((await get(me, "a")).status).toBe(200);
    expect((await get(me, "b")).status).toBe(200);
    expect((await get(me, "c")).status).toBe(429);
    // 이미 받아 둔 검색어는 한도와 상관없이 준다
    expect((await get(me, "a")).status).toBe(200);
    expect((await get(await signIn("other"), "c")).status).toBe(200);
  });
});
