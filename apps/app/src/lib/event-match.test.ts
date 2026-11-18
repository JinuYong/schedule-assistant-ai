import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/store/events";
import type { CalendarListItem } from "@/lib/google-calendar";
import {
  parseDateHint,
  matchEventsByText,
  matchCalendar,
  getEventDateKey,
  getEventDateKeys,
  eventShortLabel,
} from "./event-match";

// 2026-06-15 (월) 고정 기준일
const NOW = new Date(2026, 5, 15);

function ev(partial: { startTime: string; title: string; isAllDay?: boolean; endTime?: string }): CalendarEvent {
  return {
    isAllDay: false,
    endTime: partial.startTime,
    ...partial,
  } as unknown as CalendarEvent;
}

describe("parseDateHint", () => {
  it("상대 표현 (오늘/내일/낼/모레/어제)", () => {
    expect(parseDateHint("오늘", NOW)).toBe("2026-06-15");
    expect(parseDateHint("내일", NOW)).toBe("2026-06-16");
    expect(parseDateHint("낼 회의", NOW)).toBe("2026-06-16");
    expect(parseDateHint("모레", NOW)).toBe("2026-06-17");
    expect(parseDateHint("어제", NOW)).toBe("2026-06-14");
  });

  it("M월 D일 — 미래는 올해, 지난 날짜는 내년", () => {
    expect(parseDateHint("6월 20일", NOW)).toBe("2026-06-20");
    expect(parseDateHint("6월 10일", NOW)).toBe("2027-06-10"); // 이미 지남 → 내년
  });

  it("M/D 형식", () => {
    expect(parseDateHint("7/4 약속", NOW)).toBe("2026-07-04");
  });

  it("N일 — 이번 달 기준, 지난 날짜면 다음 달", () => {
    expect(parseDateHint("20일", NOW)).toBe("2026-06-20"); // 아직 안 지남
    expect(parseDateHint("10일", NOW)).toBe("2026-07-10"); // 지남 → 다음 달
  });

  it("무효 날짜·날짜 없음은 null", () => {
    expect(parseDateHint("2월 30일", NOW)).toBeNull();
    expect(parseDateHint("6월 31일", NOW)).toBeNull();
    expect(parseDateHint("그냥 텍스트", NOW)).toBeNull();
  });
});

describe("getEventDateKey", () => {
  it("startTime의 날짜 부분을 키로", () => {
    expect(getEventDateKey(ev({ startTime: "2026-06-15T10:00:00", title: "x" }))).toBe("2026-06-15");
  });
});

describe("getEventDateKeys", () => {
  it("단일 시간 일정은 시작일 하나", () => {
    expect(getEventDateKeys(ev({ startTime: "2026-06-03T10:00:00", title: "x", endTime: "2026-06-03T11:00:00" })))
      .toEqual(["2026-06-03"]);
  });

  it("단일 종일 일정은 end.date가 배타적이라 하루만", () => {
    expect(getEventDateKeys(ev({ startTime: "2026-06-03", title: "x", endTime: "2026-06-04", isAllDay: true })))
      .toEqual(["2026-06-03"]);
  });

  it("여러 날 종일 일정은 걸친 모든 날짜 (end 배타적 보정)", () => {
    // 6/3~6/7 표시 일정 → Google end.date = 6/8
    expect(getEventDateKeys(ev({ startTime: "2026-06-03", title: "x", endTime: "2026-06-08", isAllDay: true })))
      .toEqual(["2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06", "2026-06-07"]);
  });

  it("여러 날 시간 일정은 시작~종료 날짜 전부", () => {
    expect(getEventDateKeys(ev({ startTime: "2026-06-03T22:00:00", title: "x", endTime: "2026-06-05T02:00:00" })))
      .toEqual(["2026-06-03", "2026-06-04", "2026-06-05"]);
  });

  it("자정에 끝나는 시간 일정은 그 날을 제외", () => {
    expect(getEventDateKeys(ev({ startTime: "2026-06-03T22:00:00", title: "x", endTime: "2026-06-04T00:00:00" })))
      .toEqual(["2026-06-03"]);
  });

  it("월 경계를 넘어가는 종일 일정", () => {
    expect(getEventDateKeys(ev({ startTime: "2026-06-29", title: "x", endTime: "2026-07-02", isAllDay: true })))
      .toEqual(["2026-06-29", "2026-06-30", "2026-07-01"]);
  });
});

describe("eventShortLabel", () => {
  it("종일 일정", () => {
    expect(eventShortLabel(ev({ startTime: "2026-06-15T00:00:00", title: "x", isAllDay: true })))
      .toBe("6/15 종일");
  });

  it("시간 있는 일정은 M/D HH:MM", () => {
    expect(eventShortLabel(ev({ startTime: "2026-06-15T15:00:00", title: "x" })))
      .toBe("6/15 15:00");
  });
});

describe("matchEventsByText", () => {
  const events = [
    ev({ startTime: "2026-06-16T09:00:00", title: "아침 회의" }),
    ev({ startTime: "2026-06-16T14:00:00", title: "치과 예약" }),
    ev({ startTime: "2026-06-20T10:00:00", title: "팀 회의" }),
  ];

  it("2글자 미만 쿼리는 빈 배열", () => {
    expect(matchEventsByText("회", events, 6, NOW)).toEqual([]);
  });

  it("날짜 표현이 있으면 그날 일정을 시간순으로", () => {
    const r = matchEventsByText("내일", events, 6, NOW);
    expect(r.map((e) => e.title)).toEqual(["아침 회의", "치과 예약"]);
  });

  it("제목 토큰으로 매칭한다", () => {
    const r = matchEventsByText("회의", events, 6, NOW);
    expect(r.map((e) => e.title).sort()).toEqual(["아침 회의", "팀 회의"]);
  });

  it("매칭 없으면 빈 배열", () => {
    expect(matchEventsByText("존재하지않는일정", events, 6, NOW)).toEqual([]);
  });
});

describe("matchCalendar", () => {
  const cals = [
    { id: "1", summary: "업무" },
    { id: "2", summary: "개인" },
  ] as unknown as CalendarListItem[];

  it("완전 일치", () => {
    expect(matchCalendar("업무", cals)?.id).toBe("1");
  });

  it("이모지를 제거하고 일치시킨다", () => {
    expect(matchCalendar("📅 업무", cals)?.id).toBe("1");
  });

  it("매칭 실패 시 undefined", () => {
    expect(matchCalendar("없는캘린더", cals)).toBeUndefined();
    expect(matchCalendar("", cals)).toBeUndefined();
  });
});
