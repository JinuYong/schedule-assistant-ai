// @cali/shared recurrence.ts 테스트(shared엔 테스트 러너가 없어 서버에서 돌린다)
import { describe, expect, test } from "bun:test";
import { firstOccurrence, nextOccurrence, type TodoRepeat } from "@cali/shared";

// 2026-11-20은 금요일
const next = (date: string, repeat: TodoRepeat) => nextOccurrence(date, repeat);
const first = (date: string, repeat: TodoRepeat) =>
  firstOccurrence(date, repeat);

describe("매일", () => {
  test("매일은 다음 날", () => {
    expect(next("2026-12-31", { type: "daily", days: "all" })).toBe(
      "2027-01-01",
    );
  });
  test("평일은 금요일 다음이 월요일", () => {
    expect(next("2026-11-20", { type: "daily", days: "weekdays" })).toBe(
      "2026-11-23",
    );
    expect(first("2026-11-21", { type: "daily", days: "weekdays" })).toBe(
      "2026-11-23",
    );
  });
  test("주말은 토→일→다음 토", () => {
    const r: TodoRepeat = { type: "daily", days: "weekends" };
    expect(next("2026-11-21", r)).toBe("2026-11-22");
    expect(next("2026-11-22", r)).toBe("2026-11-28");
  });
});

describe("매주", () => {
  test("고른 요일 중 다음 요일, 주가 넘어가면 다음 주", () => {
    const r: TodoRepeat = { type: "weekly", interval: 1, weekdays: [1, 3] };
    expect(next("2026-11-23", r)).toBe("2026-11-25"); // 월 → 수
    expect(next("2026-11-25", r)).toBe("2026-11-30"); // 수 → 다음 월
  });
  test("격주는 같은 주의 남은 요일을 쓰고, 다음은 2주 뒤", () => {
    const r: TodoRepeat = { type: "weekly", interval: 2, weekdays: [1, 3] };
    expect(next("2026-11-23", r)).toBe("2026-11-25");
    expect(next("2026-11-25", r)).toBe("2026-12-07");
  });
  test("첫 회차는 마감일 이후 가장 가까운 고른 요일(마감일 포함)", () => {
    const r: TodoRepeat = { type: "weekly", interval: 2, weekdays: [1, 3] };
    expect(first("2026-11-20", r)).toBe("2026-11-23");
    expect(first("2026-11-23", r)).toBe("2026-11-23");
  });
});

describe("매월", () => {
  test("날짜: 없는 날은 말일, 그다음 달은 원래 날짜로 돌아온다", () => {
    const r: TodoRepeat = {
      type: "monthly",
      interval: 1,
      on: { kind: "day", day: 31 },
    };
    expect(next("2026-01-31", r)).toBe("2026-02-28");
    expect(next("2026-02-28", r)).toBe("2026-03-31");
  });
  test("마지막 날·N개월마다", () => {
    expect(
      next("2026-11-30", {
        type: "monthly",
        interval: 3,
        on: { kind: "lastDay" },
      }),
    ).toBe("2027-02-28");
  });
  test("N번째 요일·마지막 주 요일", () => {
    // 2026-11-19 = 셋째 주 목요일
    expect(
      next("2026-11-19", {
        type: "monthly",
        interval: 1,
        on: { kind: "weekday", week: 3, weekday: 4 },
      }),
    ).toBe("2026-12-17");
    expect(
      next("2026-11-27", {
        type: "monthly",
        interval: 1,
        on: { kind: "weekday", week: -1, weekday: 5 },
      }),
    ).toBe("2026-12-25");
  });
  test("첫 회차: 이번 달에 지났으면 다음 달", () => {
    const r: TodoRepeat = {
      type: "monthly",
      interval: 1,
      on: { kind: "day", day: 1 },
    };
    expect(first("2026-11-20", r)).toBe("2026-12-01");
    expect(first("2026-12-01", r)).toBe("2026-12-01");
  });
});

describe("매년", () => {
  test("윤일은 평년에 2월 28일, 윤년엔 다시 29일", () => {
    const r: TodoRepeat = { type: "yearly", month: 2, day: 29 };
    expect(next("2028-02-29", r)).toBe("2029-02-28");
    expect(next("2031-02-28", r)).toBe("2032-02-29");
  });
  test("첫 회차: 올해 지났으면 내년", () => {
    expect(first("2026-11-20", { type: "yearly", month: 3, day: 1 })).toBe(
      "2027-03-01",
    );
  });
});
