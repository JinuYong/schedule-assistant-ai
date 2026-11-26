// AI 일정 도구: 조회·만들기·수정·삭제. 실제 호출은 백엔드(Google·더미·시험)에 맡긴다.
//
// 일정 id는 AI에 짧은 별칭(e1, e2…)으로 준다 — 긴 Google id를 모델이 베껴 쓰다 틀리는 걸 막고,
// 별칭 표에 제목·시간을 같이 둬서 확인 문장을 다시 조회하지 않고 만든다.

import type { CalendarListItem, GCalEvent } from "@/lib/google-calendar";
import { canWriteCalendar } from "@/lib/calendar-access";
import { matchCalendar } from "@/lib/event-match";
import type { ToolImpl } from "./agent";
import {
  addDays,
  fromGoogleTimes,
  parseKst,
  toGoogleTimes,
  whenLabel,
  kstIso,
} from "./calendar-time";

export interface CalendarBackend {
  calendars(): Promise<CalendarListItem[]>;
  /** 모든 캘린더의 기간 일정(각 일정에 calendarId가 붙어 있어야 한다) */
  list(timeMin: string, timeMax: string): Promise<GCalEvent[]>;
  create(calendarId: string, body: GCalEvent): Promise<GCalEvent>;
  update(
    calendarId: string,
    eventId: string,
    body: Partial<GCalEvent>,
  ): Promise<GCalEvent>;
  remove(calendarId: string, eventId: string): Promise<void>;
}

export interface EventRef {
  calendarId: string;
  eventId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
}

export type EventRefs = ReturnType<typeof createEventRefs>;

/** 세션 동안 유지되는 별칭 표. 같은 일정은 늘 같은 별칭 */
export function createEventRefs() {
  const byAlias = new Map<string, EventRef>();
  const byKey = new Map<string, string>();
  let n = 0;
  return {
    add(ref: EventRef): string {
      const key = `${ref.calendarId}\n${ref.eventId}`;
      let alias = byKey.get(key);
      if (!alias) {
        alias = `e${++n}`;
        byKey.set(key, alias);
      }
      byAlias.set(alias, ref);
      return alias;
    },
    get: (alias: string) => byAlias.get(alias.trim()),
  };
}

/** Google 일정 → 별칭 표 항목 */
export function refOf(ev: GCalEvent, fallbackCalendarId: string): EventRef {
  return {
    calendarId: ev.calendarId ?? fallbackCalendarId,
    eventId: ev.id,
    title: ev.summary ?? "(제목 없음)",
    ...fromGoogleTimes(ev),
    location: ev.location || undefined,
  };
}

export interface CalendarToolDeps {
  backend: CalendarBackend;
  refs: EventRefs;
  /** 캘린더를 말하지 않았을 때 넣을 곳(설정의 기본 캘린더 또는 primary) */
  defaultCalendarId: () => string;
}

/** 한 번에 돌려줄 일정 수 — 너무 길면 모델이 헤맨다 */
const LIST_LIMIT = 60;
/** 조회 기간 상한 — 1년 치를 한 번에 긁지 않게 */
const LIST_MAX_DAYS = 93;

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);

function quote(ref: Pick<EventRef, "title">) {
  return `‘${ref.title}’`;
}

export function createCalendarTools(deps: CalendarToolDeps): ToolImpl[] {
  const { backend, refs } = deps;

  const calendarName = async (id: string) =>
    (await backend.calendars()).find((c) => c.id === id)?.summary ?? id;

  /** 별칭으로 일정 찾기 + 쓸 수 있는 캘린더인지 */
  async function writableRef(alias: unknown) {
    const ref = refs.get(str(alias) ?? "");
    if (!ref)
      throw new Error(
        "모르는 일정 id다. list_events로 먼저 찾아서 그 결과의 id를 써라",
      );
    const cal = (await backend.calendars()).find(
      (c) => c.id === ref.calendarId,
    );
    if (cal && !canWriteCalendar(cal))
      throw new Error(
        `‘${cal.summary}’은 읽기 전용 캘린더라 고치거나 지울 수 없다`,
      );
    return ref;
  }

  /** 수정 인자 → 바뀔 시간(없으면 null). 시작만 바꾸면 길이를 유지한다 */
  function nextTimes(ref: EventRef, a: Record<string, unknown>) {
    const start = str(a.start);
    const end = str(a.end);
    const allDay = bool(a.allDay);
    if (start === undefined && end === undefined && allDay === undefined)
      return null;
    const isAllDay = allDay ?? ref.allDay;
    const newStart = start ?? ref.start;
    let newEnd = end;
    if (newEnd === undefined && start !== undefined && allDay === undefined) {
      const length = parseKst(ref.end) - parseKst(ref.start);
      newEnd = ref.allDay
        ? addDays(newStart.slice(0, 10), Math.round(length / 86_400_000))
        : kstIso(parseKst(newStart) + length);
    }
    const g = toGoogleTimes({ start: newStart, end: newEnd, allDay: isAllDay });
    return { google: g, tool: fromGoogleTimes(g as GCalEvent) };
  }

  const listEvents: ToolImpl = {
    spec: {
      name: "list_events",
      description:
        "기간 안의 일정을 조회한다(모든 캘린더). 일정을 고치거나 지우기 전에 id를 얻으려면 먼저 부른다. 결과의 end는 종일 일정이면 포함하는 마지막 날이다",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "시작 날짜 YYYY-MM-DD (포함)" },
          to: { type: "string", description: "끝 날짜 YYYY-MM-DD (포함)" },
          query: {
            type: "string",
            description: "제목·장소에 들어간 말로 거르기(선택)",
          },
        },
        required: ["from", "to"],
      },
    },
    async run(a) {
      const from = (str(a.from) ?? "").slice(0, 10);
      let to = (str(a.to) ?? from).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from))
        throw new Error("from은 YYYY-MM-DD");
      if (to < from) to = from;
      if (to > addDays(from, LIST_MAX_DAYS)) to = addDays(from, LIST_MAX_DAYS);
      const [events, calendars] = await Promise.all([
        backend.list(
          `${from}T00:00:00+09:00`,
          `${addDays(to, 1)}T00:00:00+09:00`,
        ),
        backend.calendars(),
      ]);
      const q = str(a.query)?.trim().toLowerCase().replace(/\s+/g, "");
      const hits = events.filter((ev) => {
        if (!q) return true;
        const hay = `${ev.summary ?? ""}${ev.location ?? ""}`
          .toLowerCase()
          .replace(/\s+/g, "");
        return hay.includes(q);
      });
      const calById = new Map(calendars.map((c) => [c.id, c]));
      return {
        events: hits.slice(0, LIST_LIMIT).map((ev) => {
          const ref = refOf(ev, deps.defaultCalendarId());
          const cal = calById.get(ref.calendarId);
          return {
            id: refs.add(ref),
            title: ref.title,
            start: ref.start,
            end: ref.end,
            allDay: ref.allDay,
            ...(ref.location ? { location: ref.location } : {}),
            calendar: cal?.summary ?? ref.calendarId,
            ...(cal && !canWriteCalendar(cal) ? { readOnly: true } : {}),
          };
        }),
        ...(hits.length > LIST_LIMIT ? { truncated: hits.length } : {}),
      };
    },
  };

  const createEventTool: ToolImpl = {
    spec: {
      name: "create_event",
      description:
        "일정을 만든다. 날짜만 있고 시각이 없으면 종일 일정. 끝 시각을 말하지 않으면 end를 비운다(1시간으로 잡힌다)",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          start: {
            type: "string",
            description:
              "시간 일정은 ISO 8601(예: 2026-11-27T15:00:00+09:00), 종일은 YYYY-MM-DD",
          },
          end: {
            type: "string",
            description:
              "시간 일정은 ISO 8601, 종일은 포함하는 마지막 날 YYYY-MM-DD",
          },
          allDay: { type: "boolean" },
          location: { type: "string" },
          description: { type: "string" },
          calendar: {
            type: "string",
            description:
              "사용자가 캘린더를 분명히 지정했을 때만 그 이름. 제목에 캘린더 이름과 같은 말이 들어 있는 건 지정이 아니다",
          },
        },
        required: ["title", "start"],
      },
    },
    mutates: true,
    async run(a) {
      const title = str(a.title)?.trim();
      const start = str(a.start);
      if (!title || !start) throw new Error("title·start가 필요하다");
      const writable = (await backend.calendars()).filter(canWriteCalendar);
      const named = str(a.calendar);
      const cal = named ? matchCalendar(named, writable) : undefined;
      if (named && !cal)
        throw new Error(
          `‘${named}’ 캘린더가 없다(쓸 수 있는 캘린더: ${writable.map((c) => c.summary).join(", ")})`,
        );
      const calendarId = cal?.id ?? deps.defaultCalendarId();
      const times = toGoogleTimes({
        start,
        end: str(a.end),
        allDay: bool(a.allDay),
      });
      const created = await backend.create(calendarId, {
        id: "",
        summary: title,
        location: str(a.location) || undefined,
        description: str(a.description) || undefined,
        ...times,
      });
      const ref = refOf({ ...times, ...created, calendarId }, calendarId);
      return {
        id: refs.add(ref),
        title: ref.title,
        start: ref.start,
        end: ref.end,
        allDay: ref.allDay,
        calendar: await calendarName(calendarId),
      };
    },
    describe: (_a, r) => {
      const x = r as {
        title: string;
        start: string;
        end: string;
        allDay: boolean;
      };
      return `추가 · ${x.title} · ${whenLabel(x)}`;
    },
  };

  const updateEventTool: ToolImpl = {
    spec: {
      name: "update_event",
      description:
        "일정을 고친다. 바꿀 것만 넣는다. 시작만 옮기면 길이는 그대로 유지된다. 앱이 사용자에게 확인을 받으니 따로 묻지 말고 바로 부른다",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "list_events 결과의 id(e1 등)" },
          title: { type: "string" },
          start: { type: "string", description: "create_event와 같은 형식" },
          end: { type: "string" },
          allDay: { type: "boolean" },
          location: {
            type: "string",
            description: "빈 문자열이면 장소를 지운다",
          },
          description: { type: "string" },
        },
        required: ["id"],
      },
    },
    mutates: true,
    async confirm(a) {
      const ref = await writableRef(a.id);
      const changes: string[] = [];
      const title = str(a.title);
      if (title && title !== ref.title) changes.push(`제목 → ${title}`);
      const t = nextTimes(ref, a);
      if (t) changes.push(`시간 → ${whenLabel(t.tool)}`);
      const loc = str(a.location);
      if (loc !== undefined && loc !== (ref.location ?? ""))
        changes.push(loc ? `장소 → ${loc}` : "장소 지우기");
      if (str(a.description) !== undefined) changes.push("메모 바꾸기");
      return `${quote(ref)}(${whenLabel(ref)}) 일정을 고칠까요?\n${changes.join(" · ") || "바뀌는 내용 없음"}`;
    },
    async run(a) {
      const ref = await writableRef(a.id);
      const body: Partial<GCalEvent> = {};
      const title = str(a.title);
      if (title) body.summary = title;
      const loc = str(a.location);
      if (loc !== undefined) body.location = loc;
      const desc = str(a.description);
      if (desc !== undefined) body.description = desc;
      const t = nextTimes(ref, a);
      if (t) Object.assign(body, t.google);
      if (!Object.keys(body).length) throw new Error("바꿀 내용이 없다");
      const updated = await backend.update(ref.calendarId, ref.eventId, body);
      const next = refOf(
        { ...updated, calendarId: ref.calendarId, id: ref.eventId },
        ref.calendarId,
      );
      refs.add(next);
      return {
        id: str(a.id),
        title: next.title,
        start: next.start,
        end: next.end,
        allDay: next.allDay,
      };
    },
    describe: (_a, r) => {
      const x = r as {
        title: string;
        start: string;
        end: string;
        allDay: boolean;
      };
      return `수정 · ${x.title} · ${whenLabel(x)}`;
    },
  };

  const deleteEventTool: ToolImpl = {
    spec: {
      name: "delete_event",
      description:
        "일정을 지운다. 앱이 사용자에게 확인을 받으니 따로 묻지 말고 바로 부른다",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "list_events 결과의 id(e1 등)" },
        },
        required: ["id"],
      },
    },
    mutates: true,
    async confirm(a) {
      const ref = await writableRef(a.id);
      return `${quote(ref)}(${whenLabel(ref)}) 일정을 삭제할까요?`;
    },
    async run(a) {
      const ref = await writableRef(a.id);
      await backend.remove(ref.calendarId, ref.eventId);
      return {
        deleted: str(a.id),
        title: ref.title,
        start: ref.start,
        end: ref.end,
        allDay: ref.allDay,
      };
    },
    describe: (_a, r) => {
      const x = r as {
        title: string;
        start: string;
        end: string;
        allDay: boolean;
      };
      return `삭제 · ${x.title} · ${whenLabel(x)}`;
    },
  };

  return [listEvents, createEventTool, updateEventTool, deleteEventTool];
}
