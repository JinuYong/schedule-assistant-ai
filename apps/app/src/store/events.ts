import { create } from "zustand";
import { listUpcomingEvents, listEventsInRange, GCalEvent } from "@/lib/google-calendar";
import { storeSet } from "@/lib/tauri-store";
import { scheduleNotification, cancelNotificationsByPrefix } from "@/lib/notifications";
import { MOCK_ENABLED, MOCK_EVENTS } from "@/lib/dev-mock";
import { parseLocationLabel } from "@/lib/location";
import { showToast } from "./toast";

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  description?: string;
  location?: string;
  calendarColor?: string;
  calendarId?: string;
}

export function mapGCalEvent(e: GCalEvent): CalendarEvent {
  return {
    id: e.id,
    title: e.summary ?? "(제목 없음)",
    startTime: e.start?.dateTime ?? e.start?.date ?? "",
    endTime: e.end?.dateTime ?? e.end?.date ?? "",
    isAllDay: !e.start?.dateTime,
    description: e.description,
    location: e.location,
    calendarColor: e.calendarColor,
    calendarId: e.calendarId,
  };
}

const NOTIFY_BEFORE_MS = 15 * 60 * 1000; // 15분 전

/**
 * 알림을 미리 걸어둘 기간.
 *
 * 일정 알림은 "시작 15분 전" 고정이라 멀리까지 예약해 둘 이유가 없다.
 * 짧게 잡을수록 살아 있는 타이머 수도 줄어든다.
 */
const NOTIFY_WINDOW_DAYS = 7;

async function scheduleEventNotifications(events: CalendarEvent[]) {
  cancelNotificationsByPrefix("event-");
  for (const ev of events) {
    if (ev.isAllDay) continue;
    const startMs = new Date(ev.startTime).getTime();
    const notifyAt = startMs - NOTIFY_BEFORE_MS;
    if (notifyAt > Date.now()) {
      const timeStr = new Date(ev.startTime).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      await scheduleNotification({
        id: `event-${ev.id}`,
        title: ev.title,
        // 알림 본문은 짧아야 잘리지 않으므로 원본 주소가 아닌 간결 라벨을 쓴다
        body: `15분 후 ${timeStr}에 시작${ev.location ? ` · ${parseLocationLabel(ev.location)}` : ""}`,
        time: notifyAt,
      });
    }
  }
}

// ── 모듈 레벨 캐시 ──────────────────────────────────────────
const _eventCache = new Map<string, CalendarEvent[]>();
const _prefetching = new Set<string>();

function eventCacheKey(timeMin: string, timeMax: string) {
  return `${timeMin}|${timeMax}`;
}

interface EventsStore {
  events: CalendarEvent[];
  isLoading: boolean;
  error: string | null;
  fetchEvents: (accessToken: string, timeMin?: string, timeMax?: string) => Promise<void>;
  syncEventNotifications: (accessToken: string) => Promise<void>;
  prefetchEvents: (accessToken: string, timeMin: string, timeMax: string) => Promise<void>;
  invalidateCache: () => void;
  setEvents: (events: CalendarEvent[]) => void;
}

export const useEventsStore = create<EventsStore>((set) => ({
  events: MOCK_EVENTS,
  isLoading: false,
  error: null,

  setEvents: (events) => set({ events }),

  /** 캐시 전체 삭제 (이벤트 추가/삭제 후 stale 방지) */
  invalidateCache: () => _eventCache.clear(),

  /**
   * 알림 스케줄 동기화 — 화면에 보이는 달과 무관하게 "지금부터 NOTIFY_WINDOW_DAYS일"을 건다.
   *
   * 예전에는 fetchEvents가 알림까지 걸어서, 다른 달로 넘어가면 이번 주 일정 알림이
   * 통째로 취소됐다. 화면 이동과 알림은 아무 상관이 없어야 한다.
   */
  syncEventNotifications: async (accessToken) => {
    if (MOCK_ENABLED) return;
    const now = new Date();
    const until = new Date(now.getTime() + NOTIFY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    try {
      const raw = await listEventsInRange(accessToken, now.toISOString(), until.toISOString());
      await scheduleEventNotifications(raw.map(mapGCalEvent));
    } catch {
      // 알림 동기화 실패는 화면에 영향을 주지 않으므로 조용히 넘어간다
    }
  },

  /** 이벤트 조회 — 캐시가 있으면 즉시 표시 후 백그라운드 갱신 */
  fetchEvents: async (accessToken, timeMin, timeMax) => {
    if (MOCK_ENABLED) return; // 더미 모드: 네트워크 건너뛰고 주입된 이벤트 유지
    const key = timeMin && timeMax ? eventCacheKey(timeMin, timeMax) : null;

    // 캐시 히트 → 즉시 표시하고 로딩 시작
    if (key && _eventCache.has(key)) {
      set({ events: _eventCache.get(key)!, isLoading: true, error: null });
    } else {
      set({ isLoading: true, error: null });
    }

    try {
      let raw: GCalEvent[];
      if (timeMin && timeMax) {
        raw = await listEventsInRange(accessToken, timeMin, timeMax);
      } else {
        raw = await listUpcomingEvents(accessToken);
      }
      const mapped = raw.map(mapGCalEvent);
      if (key) _eventCache.set(key, mapped);
      set({ events: mapped });
      await storeSet("events.cache", mapped);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "일정 조회에 실패했습니다.";
      set({ error: msg });
      showToast(msg);
    } finally {
      set({ isLoading: false });
    }
  },

  /** 인접 달 백그라운드 프리페치 — 로딩 상태 변경 없음 */
  prefetchEvents: async (accessToken, timeMin, timeMax) => {
    const key = eventCacheKey(timeMin, timeMax);
    if (_eventCache.has(key) || _prefetching.has(key)) return;
    _prefetching.add(key);
    try {
      const raw = await listEventsInRange(accessToken, timeMin, timeMax);
      _eventCache.set(key, raw.map(mapGCalEvent));
    } catch {
      // 프리페치 실패는 무시
    } finally {
      _prefetching.delete(key);
    }
  },
}));
