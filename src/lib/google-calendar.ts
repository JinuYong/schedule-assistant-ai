/** Google Calendar REST API — 브라우저 fetch 사용 (CORS 지원됨) */

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

async function request<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** 캘린더 목록 캐시 (5분 TTL) */
let _calListCache: { data: CalendarListItem[]; ts: number } | null = null;
const CAL_LIST_TTL = 5 * 60 * 1000;

/** 사용자가 선택(표시)한 캘린더 목록 조회 (5분간 캐시) */
export async function getCalendarList(accessToken: string): Promise<CalendarListItem[]> {
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

/** 캘린더 목록 캐시 강제 초기화 (계정 변경 시 호출) */
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
