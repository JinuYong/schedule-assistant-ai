/** Google Calendar REST API — 브라우저 fetch 사용 (CORS 지원됨) */

import { useAuthStore } from "@/store/auth";
import { createAuthenticatedFetch } from "./authenticated-fetch";
import { MOCK_ENABLED, MOCK_CALENDARS } from "./dev-mock";
import type { ParsedEvent } from "./claude";

const BASE = "https://www.googleapis.com/calendar/v3";

export interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  /** 소속 캘린더의 배경색 (hex, e.g. "#a4bdfc") */
  calendarColor?: string;
  /** 소속 캘린더 ID */
  calendarId?: string;
}

export interface CalendarListItem {
  id: string;
  summary: string;
  selected?: boolean;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
}

const request = createAuthenticatedFetch({
  baseUrl: BASE,
  refresh: (force) => useAuthStore.getState().refreshGoogle(force),
  jsonContentType: "always",
  emptyValue: undefined,
  rateLimitMessage: "Google API 사용량 초과. 잠시 후 새로고침 버튼을 눌러주세요.",
  parseError: async (res) => {
    const err = await res.json().catch(() => ({}));
    return new Error((err as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`);
  },
});

/** 캘린더 목록 캐시 (1시간 TTL, 새로고침 버튼으로 수동 초기화 가능) */
let _calListCache: { data: CalendarListItem[]; ts: number } | null = null;
const CAL_LIST_TTL = 60 * 60 * 1000; // 1시간 (수동 새로고침 버튼으로 언제든 초기화 가능)

/** 사용자가 선택(표시)한 캘린더 목록 조회 (1시간 캐시) */
export async function getCalendarList(accessToken: string): Promise<CalendarListItem[]> {
  if (MOCK_ENABLED) return MOCK_CALENDARS; // 더미 모드
  if (_calListCache && Date.now() - _calListCache.ts < CAL_LIST_TTL) {
    return _calListCache.data;
  }
  const data = await request<{ items?: CalendarListItem[] }>(
    "/users/me/calendarList?minAccessRole=reader",
    accessToken
  );
  const result = (data.items ?? []).filter((cal) => cal.selected !== false);
  _calListCache = { data: result, ts: Date.now() };
  return result;
}

/** 캘린더 목록 캐시 강제 초기화 (계정 변경 또는 새로고침 버튼 클릭 시 호출) */
export function clearCalendarListCache() {
  _calListCache = null;
}

/** 이벤트 ID 기준 중복 제거 후 시간순 정렬 */
function dedup(events: GCalEvent[]): GCalEvent[] {
  const seen = new Set<string>();
  return events
    .filter((ev) => {
      if (!ev.id || seen.has(ev.id)) return false;
      seen.add(ev.id);
      return true;
    })
    .sort((a, b) => {
      const at = a.start?.dateTime ?? a.start?.date ?? "";
      const bt = b.start?.dateTime ?? b.start?.date ?? "";
      return at.localeCompare(bt);
    });
}

/** 모든 캘린더의 향후 이벤트 조회 */
export async function listUpcomingEvents(accessToken: string, maxResults = 50): Promise<GCalEvent[]> {
  const calendars = await getCalendarList(accessToken);
  const now = new Date().toISOString();

  const results = await Promise.all(
    calendars.map((cal) =>
      request<{ items?: GCalEvent[] }>(
        `/calendars/${encodeURIComponent(cal.id)}/events?timeMin=${encodeURIComponent(now)}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`,
        accessToken
      )
        .then((d) => (d.items ?? []).map((ev) => ({ ...ev, calendarColor: cal.backgroundColor, calendarId: cal.id })))
        .catch(() => [] as GCalEvent[])
    )
  );

  return dedup(results.flat()).slice(0, maxResults);
}

/** 모든 캘린더의 특정 기간 이벤트 조회 */
export async function listEventsInRange(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<GCalEvent[]> {
  const calendars = await getCalendarList(accessToken);
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    maxResults: "250",
    singleEvents: "true",
    orderBy: "startTime",
  });

  const results = await Promise.all(
    calendars.map((cal) =>
      request<{ items?: GCalEvent[] }>(
        `/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
        accessToken
      )
        .then((d) => (d.items ?? []).map((ev) => ({ ...ev, calendarColor: cal.backgroundColor, calendarId: cal.id })))
        .catch(() => [] as GCalEvent[])
    )
  );

  return dedup(results.flat());
}

/** parseScheduleText 결과(ParsedEvent)를 Google Calendar 이벤트 본문으로 변환 */
export function buildEventFromParsed(parsed: ParsedEvent): GCalEvent {
  return {
    id: "",
    summary: parsed.title,
    description: parsed.description,
    location: parsed.location,
    ...(parsed.isAllDay
      ? { start: { date: parsed.startTime.split("T")[0] }, end: { date: parsed.endTime.split("T")[0] } }
      : {
          start: { dateTime: parsed.startTime, timeZone: "Asia/Seoul" },
          end: { dateTime: parsed.endTime, timeZone: "Asia/Seoul" },
        }),
  };
}

export async function createEvent(
  accessToken: string,
  event: GCalEvent,
  calendarId = "primary"
): Promise<GCalEvent> {
  return request<GCalEvent>(
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    accessToken,
    { method: "POST", body: JSON.stringify(event) }
  );
}

export async function updateEvent(
  accessToken: string,
  eventId: string,
  event: Partial<GCalEvent>,
  calendarId = "primary"
): Promise<GCalEvent> {
  return request<GCalEvent>(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    accessToken,
    { method: "PATCH", body: JSON.stringify(event) }
  );
}

export async function deleteEvent(accessToken: string, eventId: string, calendarId = "primary"): Promise<void> {
  return request<void>(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, accessToken, {
    method: "DELETE",
  });
}
