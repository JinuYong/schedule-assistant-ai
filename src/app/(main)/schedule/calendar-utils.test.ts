import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/store/events";
import {
  daysInMonth,
  firstWeekday,
  buildCells,
  msUntilNextDay,
  buildMovedTimeFields,
} from "./calendar-utils";

describe("daysInMonth", () => {
  it("월별 일수", () => {
    expect(daysInMonth(2026, 5)).toBe(30); // 6월
    expect(daysInMonth(2026, 0)).toBe(31); // 1월
    expect(daysInMonth(2026, 1)).toBe(28); // 2026 평년 2월
    expect(daysInMonth(2024, 1)).toBe(29); // 2024 윤년 2월
  });
});

describe("buildCells", () => {
  const cells = buildCells(2026, 5); // 2026년 6월

  it("항상 42칸(6주)을 만든다", () => {
    expect(cells).toHaveLength(42);
  });

  it("이번 달 칸 수 == 그 달의 일수", () => {
    expect(cells.filter((c) => c.inMonth)).toHaveLength(daysInMonth(2026, 5));
  });

  it("이번 달 첫 칸은 1일이고 firstWeekday 위치에 온다", () => {
    const firstInMonth = cells.findIndex((c) => c.inMonth);
    expect(firstInMonth).toBe(firstWeekday(2026, 5));
    expect(cells[firstInMonth].date).toBe("2026-06-01");
    expect(cells[firstInMonth].day).toBe(1);
  });

  it("isSunday는 실제 요일과 일치한다", () => {
    for (const c of cells) {
      const isSun = new Date(c.date + "T00:00:00").getDay() === 0;
      expect(c.isSunday).toBe(isSun);
    }
  });

  it("연말(12월) 경계에서 다음 해로 넘어간다", () => {
    const dec = buildCells(2026, 11);
    expect(dec.filter((c) => c.inMonth)).toHaveLength(31);
    expect(dec.some((c) => c.date.startsWith("2027-01"))).toBe(true);
  });
});

describe("msUntilNextDay", () => {
  it("다음 날 자정 + 1초까지의 ms", () => {
    const now = new Date(2026, 5, 15, 10, 30, 0);
    const expected = new Date(2026, 5, 16, 0, 0, 0).getTime() - now.getTime() + 1000;
    expect(msUntilNextDay(now)).toBe(expected);
  });
});

describe("buildMovedTimeFields", () => {
  it("종일 일정은 start/end를 date로", () => {
    const e = { isAllDay: true } as unknown as CalendarEvent;
    expect(buildMovedTimeFields(e, "2026-06-20")).toEqual({
      start: { date: "2026-06-20" },
      end: { date: "2026-06-20" },
    });
  });

  it("시간 일정은 시각·소요시간을 보존하고 날짜만 옮긴다", () => {
    const e = {
      isAllDay: false,
      startTime: "2026-06-15T10:00:00",
      endTime: "2026-06-15T11:30:00", // 90분
    } as unknown as CalendarEvent;
    const r = buildMovedTimeFields(e, "2026-06-20") as {
      start: { dateTime: string; timeZone: string };
      end: { dateTime: string; timeZone: string };
    };
    const start = new Date(r.start.dateTime);
    const end = new Date(r.end.dateTime);
    expect(r.start.timeZone).toBe("Asia/Seoul");
    expect(end.getTime() - start.getTime()).toBe(90 * 60 * 1000); // 소요시간 보존
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(5);
    expect(start.getDate()).toBe(20);
    expect(start.getHours()).toBe(10); // 원본 로컬 시각 보존
    expect(start.getMinutes()).toBe(0);
  });
});
