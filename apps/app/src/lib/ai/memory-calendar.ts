// 메모리 일정 백엔드 — 시험과 더미 모드(VITE_MOCK=1)에서 Google 대신 쓴다.

import type { CalendarListItem, GCalEvent } from "@/lib/google-calendar";
import type { CalendarBackend } from "./calendar-tools";

const startKey = (e: GCalEvent) => e.start?.dateTime ?? e.start?.date ?? "";
const endKey = (e: GCalEvent) => e.end?.dateTime ?? e.end?.date ?? "";
const ms = (s: string) =>
  Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00+09:00` : s);

export function createMemoryCalendar(
  calendars: CalendarListItem[],
  seed: GCalEvent[] = [],
  onChange?: (events: GCalEvent[]) => void,
): CalendarBackend & { events: () => GCalEvent[] } {
  let events = seed.map((e) => ({ ...e }));
  let n = 0;
  const changed = () => onChange?.(events.map((e) => ({ ...e })));
  const find = (calendarId: string, eventId: string) => {
    const i = events.findIndex(
      (e) => e.id === eventId && e.calendarId === calendarId,
    );
    if (i < 0) throw new Error("Not Found");
    return i;
  };
  return {
    events: () => events,
    calendars: async () => calendars,
    async list(timeMin, timeMax) {
      const lo = ms(timeMin);
      const hi = ms(timeMax);
      return events
        .filter((e) => ms(startKey(e)) < hi && ms(endKey(e)) > lo)
        .sort((a, b) => ms(startKey(a)) - ms(startKey(b)));
    },
    async create(calendarId, body) {
      const ev = { ...body, id: `mem${++n}`, calendarId };
      events.push(ev);
      changed();
      return ev;
    },
    async update(calendarId, eventId, body) {
      const i = find(calendarId, eventId);
      events[i] = { ...events[i], ...body };
      changed();
      return events[i];
    },
    async remove(calendarId, eventId) {
      const i = find(calendarId, eventId);
      events = events.filter((_, j) => j !== i);
      changed();
    },
  };
}
