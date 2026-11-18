import { describe, expect, it } from "vitest";
import { parseLocationLabel, naverMapSearchUrl, isMappableLocation } from "./location";

describe("parseLocationLabel", () => {
  it("쉼표가 있으면 첫 세그먼트(장소명)만 취한다", () => {
    expect(parseLocationLabel("스타벅스 강남점, 대한민국 서울특별시 강남구 테헤란로 123"))
      .toBe("스타벅스 강남점");
  });

  it("선두의 국가명을 제거한다", () => {
    expect(parseLocationLabel("대한민국 서울특별시 강남구 테헤란로 123"))
      .toBe("서울특별시 강남구 테헤란로 123");
    expect(parseLocationLabel("South Korea Seoul")).toBe("Seoul");
  });

  it("선두의 5자리 우편번호를 제거한다", () => {
    expect(parseLocationLabel("06236 서울특별시 강남구")).toBe("서울특별시 강남구");
  });

  it("국가명과 우편번호가 함께 있으면 둘 다 제거한다", () => {
    expect(parseLocationLabel("대한민국 06236 서울특별시 강남구")).toBe("서울특별시 강남구");
  });

  it("짧은 자유 입력은 그대로 둔다", () => {
    expect(parseLocationLabel("회의실 A")).toBe("회의실 A");
    expect(parseLocationLabel("집")).toBe("집");
  });

  it("앞뒤 공백을 정리한다", () => {
    expect(parseLocationLabel("  회의실 A  ")).toBe("회의실 A");
  });

  it("첫 세그먼트가 비면 원본을 그대로 반환한다", () => {
    expect(parseLocationLabel(", 서울특별시 강남구")).toBe(", 서울특별시 강남구");
    expect(parseLocationLabel("")).toBe("");
    expect(parseLocationLabel("   ")).toBe("");
  });

  // Google Calendar는 국가명을 마지막 세그먼트에 두므로("장소명, 주소, 대한민국")
  // 실사용에서는 걸리지 않는 경계. 동작을 명시해 둔다.
  it("국가명이 첫 세그먼트 전체를 차지하면 그대로 남는다", () => {
    expect(parseLocationLabel("대한민국, 서울특별시 강남구")).toBe("대한민국");
  });

  it("우편번호처럼 보여도 5자리가 아니면 남긴다", () => {
    expect(parseLocationLabel("1234 서울")).toBe("1234 서울");
    expect(parseLocationLabel("123456 서울")).toBe("123456 서울");
  });
});

describe("naverMapSearchUrl", () => {
  it("한글 장소명을 percent-encoding 한다", () => {
    expect(naverMapSearchUrl("회의실 A"))
      .toBe("https://map.naver.com/p/search/%ED%9A%8C%EC%9D%98%EC%8B%A4%20A");
  });

  it("앞뒤 공백은 인코딩 전에 제거한다", () => {
    expect(naverMapSearchUrl("  강남역  ")).toBe(naverMapSearchUrl("강남역"));
  });

  it("URL을 깨뜨릴 수 있는 문자를 이스케이프한다", () => {
    const url = naverMapSearchUrl("a&b?c#d/e");
    expect(url).toBe("https://map.naver.com/p/search/a%26b%3Fc%23d%2Fe");
  });
});

describe("isMappableLocation", () => {
  it("일반 장소에는 지도 링크를 노출하지 않는다", () => {
    for (const s of ["회의실 A", "대회의실", "집", "사무실", "온라인", "Zoom", "구글 미트", "본사 5층", "3층 대회의실"]) {
      expect(isMappableLocation(s), s).toBe(false);
    }
  });

  it("상호명만 있으면 false (폼에서 주소를 채우도록 유도)", () => {
    for (const s of ["스타벅스 강남점", "강남역", "코엑스"]) {
      expect(isMappableLocation(s), s).toBe(false);
    }
  });

  it("행정구역 접미사가 있으면 주소로 본다", () => {
    expect(isMappableLocation("서울특별시 강남구 테헤란로 123")).toBe(true);
    expect(isMappableLocation("부산광역시 해운대구")).toBe(true);
    expect(isMappableLocation("제주특별자치도 서귀포시")).toBe(true);
    expect(isMappableLocation("경기도 성남시 분당구 판교역로 235")).toBe(true);
  });

  it("도로명 + 건물번호를 주소로 본다", () => {
    expect(isMappableLocation("테헤란로 123")).toBe(true);
    expect(isMappableLocation("세종대로 110")).toBe(true);
    expect(isMappableLocation("판교역로 235")).toBe(true);
    expect(isMappableLocation("역삼로7길 12")).toBe(true);
  });

  it("지번 주소를 주소로 본다", () => {
    expect(isMappableLocation("역삼동 737")).toBe(true);
    expect(isMappableLocation("삼평동 681-4")).toBe(true);
  });

  it("동호수는 지번으로 오인하지 않는다", () => {
    expect(isMappableLocation("회의실 2동 305")).toBe(false);
    expect(isMappableLocation("본관 3동")).toBe(false);
  });

  it("우편번호가 있으면 주소로 본다", () => {
    expect(isMappableLocation("06236 서울 강남구")).toBe(true);
  });

  it("시/군/구 뒤에 내용이 더 있으면 주소로 본다", () => {
    expect(isMappableLocation("강남구 역삼동")).toBe(true);
    expect(isMappableLocation("강남구")).toBe(false);
  });

  it("영문 주소를 주소로 본다", () => {
    expect(isMappableLocation("1600 Amphitheatre Pkwy Mountain View Rd")).toBe(true);
    expect(isMappableLocation("123 Main St")).toBe(true);
    expect(isMappableLocation("Conference Room B")).toBe(false);
  });

  it("Google Calendar가 자동완성한 전체 주소를 주소로 본다", () => {
    expect(isMappableLocation("스타벅스 강남점, 대한민국 서울특별시 강남구 테헤란로 123")).toBe(true);
  });

  it("빈 값은 false", () => {
    expect(isMappableLocation("")).toBe(false);
    expect(isMappableLocation("   ")).toBe(false);
  });
});
