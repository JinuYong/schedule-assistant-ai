import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/store/events";
import {
  daysInMonth,
  firstWeekday,
  buildCells,
  msUntilNextDay,
  buildMovedTimeFields,
  buildMonthLayout,
  buildEventTimeFields,
  eventEndDateForForm,
} from "./calendar-utils";

function mkEv(o: { id?: string; startTime: string; endTime?: string; isAllDay?: boolean; title?: string }): CalendarEvent {
  return {
    id: o.id ?? o.startTime,
    title: o.title ?? "x",
    isAllDay: o.isAllDay ?? false,
    startTime: o.startTime,
    endTime: o.endTime ?? o.startTime,
  } as unknown as CalendarEvent;
}

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

describe("buildMonthLayout", () => {
  // 2026년 6월: 6/1=월 → week0 = [5/31(일), 6/1 … 6/6]
  const cells = buildCells(2026, 5);

  it("멀티데이 종일 일정이 같은 레인을 가로질러 배치된다", () => {
    // 6/3~6/7 (end.date=6/8 배타적) → week0(6/3~6/6) + week1(6/7)에 걸침
    const layout = buildMonthLayout(cells, [
      mkEv({ startTime: "2026-06-03", endTime: "2026-06-08", isAllDay: true }),
    ]);

    const d3 = layout.slotsByDate.get("2026-06-03")![0]!;
    expect(d3.isStart).toBe(true);    // 실제 시작일
    expect(d3.isEnd).toBe(false);     // 아직 안 끝남
    expect(d3.showTitle).toBe(true);
    expect(d3.span).toBe(4);          // week0에서 6/3~6/6 = 4칸 가로지름
    expect(d3.covered).toBe(false);

    const d5 = layout.slotsByDate.get("2026-06-05")![0]!;
    expect(d5.covered).toBe(true);    // 시작 칸 막대에 덮인 칸
    expect(d5.span).toBe(0);
    expect(d5.showTitle).toBe(false);

    // 같은 레인(0)을 6/3~6/6 모두 차지
    for (const d of ["2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06"]) {
      expect(layout.slotsByDate.get(d)![0]?.event.id).toBe("2026-06-03");
    }
  });

  it("주 경계를 넘으면 다음 주 첫 칸에서 제목을 다시 보여주고 끝을 둥글게", () => {
    const layout = buildMonthLayout(cells, [
      mkEv({ startTime: "2026-06-03", endTime: "2026-06-08", isAllDay: true }),
    ]);
    const d7 = layout.slotsByDate.get("2026-06-07")![0]!; // 다음 주 일요일 = 실제 종료일
    expect(d7.isStart).toBe(false);   // 이전 주에서 이어짐 → 왼쪽 안 둥글게
    expect(d7.isEnd).toBe(true);      // 실제 종료
    expect(d7.showTitle).toBe(true);  // 주 시작 칸이라 제목 재표시
  });

  it("겹치는 멀티데이 일정은 서로 다른 레인", () => {
    const layout = buildMonthLayout(cells, [
      mkEv({ id: "A", startTime: "2026-06-02", endTime: "2026-06-05", isAllDay: true }),
      mkEv({ id: "B", startTime: "2026-06-03", endTime: "2026-06-06", isAllDay: true }),
    ]);
    const slots = layout.slotsByDate.get("2026-06-04")!; // 둘 다 걸치는 날
    const ids = slots.filter(Boolean).map((s) => s!.event.id).sort();
    expect(ids).toEqual(["A", "B"]);
  });

  it("maxLanes를 넘는 일정은 overflow로 집계", () => {
    const sameDay = [1, 2, 3, 4].map((n) =>
      mkEv({ id: `e${n}`, startTime: "2026-06-10T0" + n + ":00:00" })
    );
    const layout = buildMonthLayout(cells, sameDay, 3);
    expect(layout.slotsByDate.get("2026-06-10")).toHaveLength(3);
    expect(layout.overflowByDate.get("2026-06-10")).toBe(1);
  });
});

describe("buildEventTimeFields", () => {
  const base = { startTime: "09:00", endTime: "10:00" };

  it("종일 단일: end.date는 다음 날(배타적)", () => {
    expect(buildEventTimeFields({ ...base, isAllDay: true, date: "2026-06-03", endDate: "2026-06-03" }))
      .toEqual({ start: { date: "2026-06-03" }, end: { date: "2026-06-04" } });
  });

  it("종일 범위: 종료일+1을 end.date로", () => {
    expect(buildEventTimeFields({ ...base, isAllDay: true, date: "2026-06-03", endDate: "2026-06-05" }))
      .toEqual({ start: { date: "2026-06-03" }, end: { date: "2026-06-06" } });
  });

  it("종일: 종료일이 시작일보다 앞이면 단일로 간주", () => {
    expect(buildEventTimeFields({ ...base, isAllDay: true, date: "2026-06-03", endDate: "2026-06-01" }))
      .toEqual({ start: { date: "2026-06-03" }, end: { date: "2026-06-04" } });
  });

  it("시간 일정 같은 날", () => {
    expect(buildEventTimeFields({ isAllDay: false, date: "2026-06-03", endDate: "2026-06-03", startTime: "09:00", endTime: "10:30" }))
      .toEqual({
        start: { dateTime: "2026-06-03T09:00:00", timeZone: "Asia/Seoul" },
        end: { dateTime: "2026-06-03T10:30:00", timeZone: "Asia/Seoul" },
      });
  });

  it("시간 일정 자정 넘김(다른 날)", () => {
    expect(buildEventTimeFields({ isAllDay: false, date: "2026-06-03", endDate: "2026-06-04", startTime: "22:00", endTime: "02:00" }))
      .toEqual({
        start: { dateTime: "2026-06-03T22:00:00", timeZone: "Asia/Seoul" },
        end: { dateTime: "2026-06-04T02:00:00", timeZone: "Asia/Seoul" },
      });
  });
});

describe("eventEndDateForForm", () => {
  it("종일: end.date 배타적이라 -1일(포함 종료일)", () => {
    expect(eventEndDateForForm({ isAllDay: true, startTime: "2026-06-03", endTime: "2026-06-05" })).toBe("2026-06-04");
  });

  it("종일 단일(end=start+1) → 시작일", () => {
    expect(eventEndDateForForm({ isAllDay: true, startTime: "2026-06-03", endTime: "2026-06-04" })).toBe("2026-06-03");
  });

  it("시간 일정: 종료 일시의 날짜", () => {
    expect(eventEndDateForForm({ isAllDay: false, startTime: "2026-06-03T10:00", endTime: "2026-06-03T11:00" })).toBe("2026-06-03");
    expect(eventEndDateForForm({ isAllDay: false, startTime: "2026-06-03T23:00", endTime: "2026-06-04T01:00" })).toBe("2026-06-04");
  });

  it("endTime 없으면 시작일", () => {
    expect(eventEndDateForForm({ isAllDay: true, startTime: "2026-06-03" })).toBe("2026-06-03");
  });
});

describe("buildMovedTimeFields", () => {
  it("종일 일정은 일수(span)를 보존하며 이동한다", () => {
    // 2일짜리 종일 일정(end.date 배타적: 6/3~6/4 → end 6/5)
    const e = { isAllDay: true, startTime: "2026-06-03", endTime: "2026-06-05" } as unknown as CalendarEvent;
    expect(buildMovedTimeFields(e, "2026-06-20")).toEqual({
      start: { date: "2026-06-20" },
      end: { date: "2026-06-22" }, // 2일 유지
    });
  });

  it("단일 종일 일정은 1일을 유지한다", () => {
    const e = { isAllDay: true, startTime: "2026-06-03", endTime: "2026-06-04" } as unknown as CalendarEvent;
    expect(buildMovedTimeFields(e, "2026-06-20")).toEqual({
      start: { date: "2026-06-20" },
      end: { date: "2026-06-21" },
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
