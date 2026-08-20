import { describe, expect, it } from "vitest";
import { eventColor, HOLIDAY_COLOR, OBSERVANCE_COLOR } from "./event-color";

/** 실제 Google 공휴일 캘린더 id와 색 */
const HOLIDAY_CAL = "ko.south_korea#holiday@group.v.calendar.google.com";
const HOLIDAY_CAL_COLOR = "#fa573c";

/** Google이 기념일에 덧붙여 보내는 안내문 (실제 응답 형태) */
const OBSERVANCE_DESC =
  "기념일\n기념일을 숨기려면 Google Calendar 설정 > 대한민국의 휴일 캘린더로 이동하세요.";

describe("eventColor", () => {
  describe("공휴일 캘린더", () => {
    const holiday = (description?: string) => ({
      description,
      calendarColor: HOLIDAY_CAL_COLOR,
      calendarId: HOLIDAY_CAL,
    });

    it("쉬는 날은 벽돌색", () => {
      expect(eventColor(holiday("공휴일"))).toBe(HOLIDAY_COLOR);
    });

    it("기념일은 청회색 — 안내문이 붙어 와도 인식한다", () => {
      expect(eventColor(holiday(OBSERVANCE_DESC))).toBe(OBSERVANCE_COLOR);
    });

    it("24절기·잡절처럼 모르는 종류도 쉬는 날이 아니므로 청회색", () => {
      expect(eventColor(holiday("24절기"))).toBe(OBSERVANCE_COLOR);
      expect(eventColor(holiday("잡절"))).toBe(OBSERVANCE_COLOR);
    });

    it("description이 없으면 쉬는 날이라는 근거가 없으므로 청회색", () => {
      expect(eventColor(holiday())).toBe(OBSERVANCE_COLOR);
    });

    it("공휴일에 안내문이 덧붙어도 인식한다", () => {
      expect(eventColor(holiday("공휴일\n어쩌고 안내문"))).toBe(HOLIDAY_COLOR);
    });

    it("다른 나라 공휴일 캘린더도 같은 형식이라 걸린다", () => {
      expect(eventColor({
        description: "공휴일",
        calendarColor: HOLIDAY_CAL_COLOR,
        calendarId: "en.usa#holiday@group.v.calendar.google.com",
      })).toBe(HOLIDAY_COLOR);
    });
  });

  describe("일반 캘린더", () => {
    it("캘린더 색을 그대로 쓴다", () => {
      expect(eventColor({ calendarColor: "#5b9bd5", calendarId: "work" })).toBe("#5b9bd5");
    });

    it("설명에 \"공휴일\"이라 적어도 색을 바꾸지 않는다", () => {
      // 캘린더로 먼저 거르므로 사용자가 쓴 문구에 휘둘리지 않는다
      expect(eventColor({ description: "공휴일", calendarColor: "#5b9bd5", calendarId: "work" }))
        .toBe("#5b9bd5");
    });

    it("캘린더 색이 없으면 undefined (호출부가 기본 스타일로 폴백)", () => {
      expect(eventColor({})).toBeUndefined();
      expect(eventColor({ calendarId: "work" })).toBeUndefined();
    });
  });

  it("공휴일과 기념일은 서로 구분되는 색이다", () => {
    expect(HOLIDAY_COLOR).not.toBe(OBSERVANCE_COLOR);
  });
});
