import { describe, expect, it } from "vitest";
import type { ToolImpl } from "./agent";
import { createCalendarTools, createEventRefs } from "./calendar-tools";
import { createMemoryCalendar } from "./memory-calendar";

const calendars = [
  { id: "primary", summary: "내 캘린더", primary: true, accessRole: "owner" },
  { id: "work", summary: "회사", accessRole: "writer" },
  { id: "holiday", summary: "대한민국의 휴일", accessRole: "reader" },
];

function setup() {
  const backend = createMemoryCalendar(calendars, [
    {
      id: "g1",
      calendarId: "work",
      summary: "팀 회의",
      start: { dateTime: "2026-11-30T10:00:00+09:00" },
      end: { dateTime: "2026-11-30T11:00:00+09:00" },
    },
    {
      id: "g2",
      calendarId: "holiday",
      summary: "개천절",
      start: { date: "2026-11-30" },
      end: { date: "2026-12-01" },
    },
    {
      id: "g3",
      calendarId: "primary",
      summary: "점심 약속",
      location: "강남역",
      start: { dateTime: "2026-12-01T12:00:00+09:00" },
      end: { dateTime: "2026-12-01T13:00:00+09:00" },
    },
  ]);
  const tools = createCalendarTools({
    backend,
    refs: createEventRefs(),
    defaultCalendarId: () => "primary",
  });
  const t = (name: string) =>
    tools.find((x) => x.spec.name === name) as ToolImpl;
  return { backend, t };
}

type Listed = { events: { id: string; title: string; readOnly?: boolean }[] };

describe("일정 도구", () => {
  it("list_events: 기간(끝 포함)·별칭·읽기 전용 표시", async () => {
    const { t } = setup();
    const r = (await t("list_events").run({
      from: "2026-11-30",
      to: "2026-11-30",
    })) as Listed;
    expect(r.events.map((e) => [e.id, e.title, e.readOnly])).toEqual([
      ["e1", "개천절", true],
      ["e2", "팀 회의", undefined],
    ]);
    // 같은 일정은 다시 조회해도 같은 별칭
    const again = (await t("list_events").run({
      from: "2026-11-29",
      to: "2026-12-01",
    })) as Listed;
    expect(again.events.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("list_events: 검색어로 거른다(제목·장소, 띄어쓰기 무시)", async () => {
    const { t } = setup();
    const r = (await t("list_events").run({
      from: "2026-11-01",
      to: "2026-12-31",
      query: "강남 역",
    })) as Listed;
    expect(r.events.map((e) => e.title)).toEqual(["점심 약속"]);
  });

  it("create_event: 기본 캘린더, 종일 여러 날, 한 줄 기록", async () => {
    const { t, backend } = setup();
    const tool = t("create_event");
    const r = await tool.run({
      title: "제주 여행",
      start: "2026-12-03",
      end: "2026-12-05",
      allDay: true,
    });
    expect(r).toMatchObject({
      title: "제주 여행",
      start: "2026-12-03",
      end: "2026-12-05",
      calendar: "내 캘린더",
    });
    const saved = backend.events().find((e) => e.summary === "제주 여행")!;
    expect(saved).toMatchObject({
      calendarId: "primary",
      end: { date: "2026-12-06" },
    });
    expect(tool.describe!({}, r)).toBe("추가 · 제주 여행 · 12/3(목)~12/5(토)");
  });

  it("create_event: 캘린더 지정은 쓸 수 있는 것 중에서만", async () => {
    const { t, backend } = setup();
    await t("create_event").run({
      title: "보고",
      start: "2026-12-02T09:00",
      calendar: "회사",
    });
    expect(backend.events().find((e) => e.summary === "보고")?.calendarId).toBe(
      "work",
    );
    await expect(
      t("create_event").run({
        title: "x",
        start: "2026-12-02",
        calendar: "대한민국의 휴일",
      }),
    ).rejects.toThrow("캘린더가 없다");
  });

  it("update_event: 확인 문장, 시작만 옮기면 길이 유지", async () => {
    const { t, backend } = setup();
    await t("list_events").run({ from: "2026-11-30", to: "2026-11-30" });
    const tool = t("update_event");
    const q = await tool.confirm!({
      id: "e2",
      start: "2026-11-30T15:00:00+09:00",
    });
    expect(q).toBe(
      "‘팀 회의’(11/30(월) 10:00~11:00) 일정을 고칠까요?\n시간 → 11/30(월) 15:00~16:00",
    );
    await tool.run({ id: "e2", start: "2026-11-30T15:00:00+09:00" });
    expect(backend.events().find((e) => e.id === "g1")).toMatchObject({
      start: { dateTime: "2026-11-30T15:00:00+09:00" },
      end: { dateTime: "2026-11-30T16:00:00+09:00" },
    });
  });

  it("update_event: 장소 지우기·제목", async () => {
    const { t, backend } = setup();
    await t("list_events").run({ from: "2026-12-01", to: "2026-12-01" });
    const q = await t("update_event").confirm!({
      id: "e1",
      title: "점심",
      location: "",
    });
    expect(q).toContain("제목 → 점심 · 장소 지우기");
    await t("update_event").run({ id: "e1", title: "점심", location: "" });
    expect(backend.events().find((e) => e.id === "g3")).toMatchObject({
      summary: "점심",
      location: "",
    });
  });

  it("수정·삭제: 모르는 id, 읽기 전용 캘린더는 막는다", async () => {
    const { t } = setup();
    await expect(t("delete_event").run({ id: "e9" })).rejects.toThrow(
      "list_events로 먼저",
    );
    await t("list_events").run({ from: "2026-11-30", to: "2026-11-30" });
    await expect(t("delete_event").confirm!({ id: "e1" })).rejects.toThrow(
      "읽기 전용",
    );
  });

  it("delete_event: 확인 문장 후 지운다", async () => {
    const { t, backend } = setup();
    await t("list_events").run({ from: "2026-11-30", to: "2026-11-30" });
    expect(await t("delete_event").confirm!({ id: "e2" })).toBe(
      "‘팀 회의’(11/30(월) 10:00~11:00) 일정을 삭제할까요?",
    );
    const r = await t("delete_event").run({ id: "e2" });
    expect(backend.events().some((e) => e.id === "g1")).toBe(false);
    expect(t("delete_event").describe!({}, r)).toBe(
      "삭제 · 팀 회의 · 11/30(월) 10:00~11:00",
    );
  });
});
