import { describe, expect, it } from "vitest";
import {
  canEditEvent,
  canWriteCalendar,
  writableCalendars,
} from "./calendar-access";

const cals = [
  { id: "primary", accessRole: "owner" },
  { id: "work", accessRole: "writer" },
  { id: "holiday", accessRole: "reader" },
  { id: "busy", accessRole: "freeBusyReader" },
];

describe("canWriteCalendar", () => {
  it("owner·writer만 쓸 수 있다", () => {
    expect(cals.map(canWriteCalendar)).toEqual([true, true, false, false]);
  });

  it("accessRole이 없으면(더미) 쓸 수 있다고 본다", () => {
    expect(canWriteCalendar({})).toBe(true);
  });
});

describe("writableCalendars", () => {
  it("읽기 전용을 뺀다", () => {
    expect(writableCalendars(cals).map((c) => c.id)).toEqual([
      "primary",
      "work",
    ]);
  });
});

describe("canEditEvent", () => {
  it("읽기 전용 캘린더의 일정은 못 고친다", () => {
    expect(canEditEvent({ calendarId: "holiday" }, cals)).toBe(false);
    expect(canEditEvent({ calendarId: "work" }, cals)).toBe(true);
  });

  it("목록에 없는 캘린더·calendarId 없음은 막지 않는다", () => {
    expect(canEditEvent({ calendarId: "unknown" }, cals)).toBe(true);
    expect(canEditEvent({}, cals)).toBe(true);
    expect(canEditEvent({ calendarId: "holiday" }, [])).toBe(true);
  });
});
