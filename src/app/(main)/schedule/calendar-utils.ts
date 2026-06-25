import { CalendarEvent } from "@/store/events";
import { isoDate } from "@/lib/date-utils";
import { getEventDateKeys } from "@/lib/event-match";

// ── 달력 그리드 계산 ────────────────────────────────────────

export function firstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getTodayInfo() {
  const today = new Date();
  return {
    year: today.getFullYear(),
    month: today.getMonth(),
    date: isoDate(today.getFullYear(), today.getMonth(), today.getDate()),
  };
}

export function msUntilNextDay(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 1000;
}

export interface CalCell {
  date: string;
  day: number;
  inMonth: boolean;
  isSunday: boolean;
}

export function buildCells(year: number, month: number): CalCell[] {
  const firstWd = firstWeekday(year, month);
  const dim = daysInMonth(year, month);
  const prevY = month === 0 ? year - 1 : year;
  const prevM = month === 0 ? 11 : month - 1;
  const prevDim = daysInMonth(prevY, prevM);
  const cells: CalCell[] = [];
  for (let i = firstWd - 1; i >= 0; i--) {
    const d = prevDim - i;
    const dt = isoDate(prevY, prevM, d);
    cells.push({date: dt, day: d, inMonth: false, isSunday: new Date(dt + "T00:00:00").getDay() === 0});
  }
  for (let d = 1; d <= dim; d++) {
    const dt = isoDate(year, month, d);
    cells.push({date: dt, day: d, inMonth: true, isSunday: new Date(dt + "T00:00:00").getDay() === 0});
  }
  const nextY = month === 11 ? year + 1 : year;
  const nextM = month === 11 ? 0 : month + 1;
  let nextD = 1;
  while (cells.length < 42) {
    const dt = isoDate(nextY, nextM, nextD);
    cells.push({date: dt, day: nextD, inMonth: false, isSunday: new Date(dt + "T00:00:00").getDay() === 0});
    nextD++;
  }
  return cells;
}

// ── 월간 레이아웃(멀티데이 연속 막대) ──────────────────────

/** 달력 한 칸에 들어가는 막대 한 조각 */
export interface LaneSlot {
  event: CalendarEvent;
  isStart: boolean;   // 이 칸이 일정의 실제 시작일 → 왼쪽 모서리 둥글게
  isEnd: boolean;     // 이 칸이 일정의 실제 종료일 → 오른쪽 모서리 둥글게
  showTitle: boolean; // 주의 첫 칸이거나 시작일 → 제목 표시
}

export interface MonthLayout {
  /** 날짜별 레인 슬롯 배열 (null = 빈 레인, 같은 주 칸끼리 길이 동일 → 세로 정렬) */
  slotsByDate: Map<string, (LaneSlot | null)[]>;
  /** 날짜별로 레인 한도(maxLanes)를 넘어 숨겨진 일정 수 */
  overflowByDate: Map<string, number>;
}

/**
 * 달력 셀 + 이벤트 → 주 단위 레인 레이아웃.
 * 멀티데이 일정이 같은 주 안에서 동일 레인을 차지하도록 배정해, 칸을 가로지르는 연속 막대로 렌더한다.
 * 멀티데이(긴 일정)를 위 레인에 먼저 채우고, 한 주에서 maxLanes를 넘는 건 overflow로 집계한다.
 */
export function buildMonthLayout(cells: CalCell[], events: CalendarEvent[], maxLanes = 3): MonthLayout {
  const slotsByDate = new Map<string, (LaneSlot | null)[]>();
  const overflowByDate = new Map<string, number>();

  const keysCache = new Map<CalendarEvent, string[]>();
  const keysOf = (ev: CalendarEvent) => {
    let k = keysCache.get(ev);
    if (!k) { k = getEventDateKeys(ev); keysCache.set(ev, k); }
    return k;
  };

  interface Seg { event: CalendarEvent; startCol: number; endCol: number; isStart: boolean; isEnd: boolean; }

  const weekCount = Math.ceil(cells.length / 7);
  for (let w = 0; w < weekCount; w++) {
    const weekDates = cells.slice(w * 7, w * 7 + 7).map((c) => c.date);
    const colOf = new Map(weekDates.map((d, i) => [d, i]));

    const segs: Seg[] = [];
    for (const ev of events) {
      const keys = keysOf(ev);
      let lo = Infinity, hi = -Infinity;
      for (const k of keys) {
        const idx = colOf.get(k);
        if (idx === undefined) continue;
        if (idx < lo) lo = idx;
        if (idx > hi) hi = idx;
      }
      if (hi < 0) continue; // 이 주에 걸치지 않음
      segs.push({
        event: ev, startCol: lo, endCol: hi,
        isStart: weekDates[lo] === keys[0],
        isEnd: weekDates[hi] === keys[keys.length - 1],
      });
    }

    // 긴 일정 먼저(위 레인) → 시작 컬럼 → 시작시각 → id (안정적 배치)
    segs.sort((a, b) =>
      (b.endCol - b.startCol) - (a.endCol - a.startCol) ||
      a.startCol - b.startCol ||
      a.event.startTime.localeCompare(b.event.startTime) ||
      a.event.id.localeCompare(b.event.id)
    );

    // 그리디 레인 배정
    const laneOcc: boolean[][] = [];
    const laneOf = new Map<Seg, number>();
    for (const seg of segs) {
      let lane = 0;
      for (; ; lane++) {
        if (!laneOcc[lane]) laneOcc[lane] = new Array(7).fill(false);
        let free = true;
        for (let c = seg.startCol; c <= seg.endCol; c++) if (laneOcc[lane][c]) { free = false; break; }
        if (free) {
          for (let c = seg.startCol; c <= seg.endCol; c++) laneOcc[lane][c] = true;
          break;
        }
      }
      laneOf.set(seg, lane);
    }

    const usedLanes = Math.min(laneOcc.length, maxLanes);
    for (const d of weekDates) slotsByDate.set(d, new Array(usedLanes).fill(null));

    for (const seg of segs) {
      const lane = laneOf.get(seg)!;
      for (let c = seg.startCol; c <= seg.endCol; c++) {
        const date = weekDates[c];
        if (lane < usedLanes) {
          slotsByDate.get(date)![lane] = {
            event: seg.event,
            isStart: seg.isStart && c === seg.startCol,
            isEnd: seg.isEnd && c === seg.endCol,
            showTitle: c === seg.startCol,
          };
        } else {
          overflowByDate.set(date, (overflowByDate.get(date) ?? 0) + 1);
        }
      }
    }
  }

  return { slotsByDate, overflowByDate };
}

// ── 이벤트 유틸 ─────────────────────────────────────────────

/** 이벤트를 다른 날짜로 이동할 때 시간 보존 */
export function buildMovedTimeFields(ev: CalendarEvent, newDate: string) {
  if (ev.isAllDay) {
    return {start: {date: newDate}, end: {date: newDate}};
  }
  const origStart = new Date(ev.startTime);
  const durationMs = new Date(ev.endTime).getTime() - origStart.getTime();
  const [y, m, d] = newDate.split("-").map(Number);
  const newStart = new Date(y, m - 1, d, origStart.getHours(), origStart.getMinutes(), origStart.getSeconds());
  const newEnd = new Date(newStart.getTime() + durationMs);
  return {
    start: {dateTime: newStart.toISOString(), timeZone: "Asia/Seoul"},
    end: {dateTime: newEnd.toISOString(), timeZone: "Asia/Seoul"},
  };
}

// ── 일정 폼 ─────────────────────────────────────────────────

export interface EventForm {
  open: boolean;
  editEventId: string | null; // null = 새 일정, string = 수정
  editCalendarId: string | null; // 수정 시 원본 캘린더 ID
  title: string;
  date: string;
  isAllDay: boolean;
  startTime: string;
  endTime: string;
  location: string;
  calendarId: string;
  submitting: boolean;
}

export const EMPTY_FORM: EventForm = {
  open: false, editEventId: null, editCalendarId: null,
  title: "", date: "", isAllDay: false,
  startTime: "09:00", endTime: "10:00", location: "", calendarId: "primary", submitting: false,
};
