// 더미 모드(VITE_MOCK=1) 일정 백엔드: 더미 일정으로 시작하는 메모리 캘린더, 바뀌면 화면 store에 반영.

import type { GCalEvent } from "@/lib/google-calendar";
import { MOCK_CALENDARS, MOCK_EVENTS } from "@/lib/dev-mock";
import { mapGCalEvent, useEventsStore } from "@/store/events";
import { createMemoryCalendar } from "./memory-calendar";

export function createMockCalendarBackend() {
  const color = (id?: string) =>
    MOCK_CALENDARS.find((c) => c.id === id)?.backgroundColor;
  const seed: GCalEvent[] = MOCK_EVENTS.map((e) => ({
    id: e.id,
    summary: e.title,
    location: e.location,
    description: e.description,
    calendarId: e.calendarId ?? "primary",
    calendarColor: e.calendarColor,
    start: e.isAllDay
      ? { date: e.startTime.slice(0, 10) }
      : { dateTime: e.startTime },
    end: e.isAllDay
      ? { date: e.endTime.slice(0, 10) }
      : { dateTime: e.endTime },
  }));
  return createMemoryCalendar(MOCK_CALENDARS, seed, (events) =>
    useEventsStore.getState().setEvents(
      events.map((e) =>
        mapGCalEvent({
          ...e,
          calendarColor: e.calendarColor ?? color(e.calendarId),
        }),
      ),
    ),
  );
}
