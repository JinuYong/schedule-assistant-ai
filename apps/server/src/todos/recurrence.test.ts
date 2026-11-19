import { describe, expect, test } from "bun:test";
import { advance, advanceDate } from "./recurrence";

describe("advanceDate", () => {
  test("매일·매주는 간격만큼 날짜를 더한다", () => {
    expect(advanceDate("2026-11-30", { type: "daily", interval: 1 })).toBe(
      "2026-12-01",
    );
    expect(advanceDate("2026-12-28", { type: "weekly", interval: 2 })).toBe(
      "2027-01-11",
    );
  });

  test("매월은 없는 날을 그달 말일로 맞춘다", () => {
    expect(advanceDate("2026-01-31", { type: "monthly", interval: 1 })).toBe(
      "2026-02-28",
    );
    expect(advanceDate("2027-12-31", { type: "monthly", interval: 2 })).toBe(
      "2028-02-29",
    );
    expect(advanceDate("2026-11-15", { type: "monthly", interval: 3 })).toBe(
      "2027-02-15",
    );
  });

  test("매년은 윤일을 2월 28일로", () => {
    expect(advanceDate("2028-02-29", { type: "yearly", interval: 1 })).toBe(
      "2029-02-28",
    );
  });
});

test("advance는 시각을 유지한다", () => {
  const next = advance(new Date("2026-01-31T00:30:00.000Z"), {
    type: "monthly",
    interval: 1,
  });
  expect(next.toISOString()).toBe("2026-02-28T00:30:00.000Z");
});
