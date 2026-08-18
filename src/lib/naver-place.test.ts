import { describe, expect, it } from "vitest";
import { stripHtmlTags, toLocationString, parsePlaceItems } from "./naver-place";
import { parseLocationLabel, isMappableLocation } from "./location";

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

describe("toLocationString", () => {
  const base = { name: "", roadAddress: "", address: "", category: "" };

  it("상호명과 도로명주소를 쉼표로 합친다", () => {
    expect(toLocationString({
      ...base,
      name: "스타벅스 역삼역점",
      roadAddress: "서울특별시 강남구 테헤란로 123",
      address: "서울특별시 강남구 역삼동 737",
    })).toBe("스타벅스 역삼역점, 서울특별시 강남구 테헤란로 123");
  });

  it("도로명주소가 없으면 지번주소를 쓴다", () => {
    expect(toLocationString({
      ...base,
      name: "동네카페",
      address: "서울특별시 강남구 역삼동 737",
    })).toBe("동네카페, 서울특별시 강남구 역삼동 737");
  });

  it("주소가 아예 없으면 상호명만 남긴다", () => {
    expect(toLocationString({ ...base, name: "동네카페" })).toBe("동네카페");
  });

  it("상호명이 없으면 주소만 남긴다", () => {
    expect(toLocationString({ ...base, roadAddress: "서울특별시 강남구 테헤란로 123" }))
      .toBe("서울특별시 강남구 테헤란로 123");
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

// 검색 결과 → 저장 문자열 → 표시/지도링크 까지의 계약을 한 번에 고정한다.
// 이 조합이 깨지면 리스트에 주소가 통째로 노출되거나 지도 버튼이 사라진다.
describe("장소 검색 결과가 표시·지도링크와 맞물리는지", () => {
  const picked = toLocationString({
    name: "스타벅스 역삼역점",
    roadAddress: "서울특별시 강남구 테헤란로 123",
    address: "서울특별시 강남구 역삼동 737",
    category: "음식점>카페",
  });

  it("저장 문자열은 '상호명, 도로명주소' 형태다", () => {
    expect(picked).toBe("스타벅스 역삼역점, 서울특별시 강남구 테헤란로 123");
  });

  it("리스트에는 상호명만 보인다", () => {
    expect(parseLocationLabel(picked)).toBe("스타벅스 역삼역점");
  });

  it("상세에는 지도 링크가 노출된다", () => {
    expect(isMappableLocation(picked)).toBe(true);
  });

  it("주소 없이 상호명만 저장되면 지도 링크가 나오지 않는다", () => {
    const nameOnly = toLocationString({
      name: "동네카페", roadAddress: "", address: "", category: "",
    });
    expect(nameOnly).toBe("동네카페");
    expect(isMappableLocation(nameOnly)).toBe(false);
  });
});
