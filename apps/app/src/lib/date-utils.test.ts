import { afterEach, describe, expect, it, vi } from "vitest";
import { isoDate, formatTime, formatDue } from "./date-utils";

describe("isoDate", () => {
  it("month는 0-based를 1-based로 변환하고 2자리로 패딩한다", () => {
    expect(isoDate(2026, 5, 3)).toBe("2026-06-03");
    expect(isoDate(2026, 0, 1)).toBe("2026-01-01");
    expect(isoDate(2026, 11, 31)).toBe("2026-12-31");
  });
});

describe("formatTime", () => {
  it("정시는 분을 생략한다", () => {
    const s = formatTime("2026-06-15T15:00:00");
    expect(s).toContain("오후");
    expect(s).not.toContain(":");
  });

  it("정시가 아니면 분을 표기한다", () => {
    const s = formatTime("2026-06-15T15:30:00");
    expect(s).toContain("오후");
    expect(s).toContain("30");
  });
});

describe("formatDue", () => {
  afterEach(() => vi.useRealTimers());

  it('오늘은 "오늘", 지난 날짜는 isPast', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 23, 30));
    expect(formatDue("2026-06-15")).toEqual({ label: "오늘", isPast: false });
    expect(formatDue("2026-06-14").isPast).toBe(true);
    expect(formatDue("2026-06-16").isPast).toBe(false);
  });
});
