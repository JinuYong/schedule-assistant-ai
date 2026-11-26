// 일정 도구의 실제 백엔드: Google Calendar REST(lib/google-calendar.ts)를 그대로 쓴다.

import {
  createEvent,
  deleteEvent,
  getCalendarList,
  listEventsInRange,
  updateEvent,
} from "@/lib/google-calendar";
import type { CalendarBackend } from "./calendar-tools";

export function googleCalendarBackend(
  getToken: () => Promise<string | null>,
): CalendarBackend {
  const token = async () => {
    const t = await getToken();
    if (!t)
      throw new Error("Google 계정이 연결돼 있지 않다(설정에서 연결 필요)");
    return t;
  };
  return {
    calendars: async () => getCalendarList(await token()),
    list: async (min, max) => listEventsInRange(await token(), min, max),
    // 빈 id를 보내면 Google이 그 값을 쓰려 해서 뺀다
    create: async (calendarId, { id: _id, ...body }) =>
      createEvent(
        await token(),
        body as Parameters<typeof createEvent>[1],
        calendarId,
      ),
    update: async (calendarId, eventId, body) =>
      updateEvent(await token(), eventId, body, calendarId),
    remove: async (calendarId, eventId) =>
      deleteEvent(await token(), eventId, calendarId),
  };
}
