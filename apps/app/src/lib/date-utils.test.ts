import { afterEach, describe, expect, it, vi } from "vitest";
import { isoDate, graphDateTimeToMs, formatTime, formatDue } from "./date-utils";

describe("isoDate", () => {
  it("month는 0-based를 1-based로 변환하고 2자리로 패딩한다", () => {
    expect(isoDate(2026, 5, 3)).toBe("2026-06-03");
    expect(isoDate(2026, 0, 1)).toBe("2026-01-01");
    expect(isoDate(2026, 11, 31)).toBe("2026-12-31");
  });
});

describe("graphDateTimeToMs", () => {
  it("오프셋 없는 값은 UTC로 간주한다 (Graph 기본 동작)", () => {
    expect(graphDateTimeToMs("2026-06-15T03:20:00")).toBe(Date.UTC(2026, 5, 15, 3, 20, 0));
  });

  it("분수초(.0000000)는 제거하고 파싱한다", () => {
    expect(graphDateTimeToMs("2026-06-15T03:20:00.0000000")).toBe(Date.UTC(2026, 5, 15, 3, 20, 0));
  });

  it("명시적 Z는 그대로 UTC로 파싱한다", () => {
    expect(graphDateTimeToMs("2026-06-15T03:20:00Z")).toBe(Date.UTC(2026, 5, 15, 3, 20, 0));
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

  it("지난 날짜는 isPast=true", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    expect(formatDue("2020-01-01T00:00:00").isPast).toBe(true);
  });

  it("미래 날짜는 isPast=false", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    expect(formatDue("2030-01-01T00:00:00").isPast).toBe(false);
  });
});
