import { CalendarEvent } from "@/store/events";
import { isoDate, formatDateLabel } from "@/lib/date-utils";
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

/** 달력 한 칸의 레인 슬롯. 막대는 시작 칸에서 span개 칸을 가로질러 덮고, 나머지 칸은 covered(투명 자리채움). */
export interface LaneSlot {
  event: CalendarEvent;
  span: number;       // 시작 칸이 가로로 차지하는 칸 수(>=1). covered 칸은 0
  isStart: boolean;   // 일정의 실제 시작일 → 왼쪽 모서리 둥글게
  isEnd: boolean;     // 일정의 실제 종료일 → 오른쪽 모서리 둥글게
  showTitle: boolean; // 막대가 시작되는 칸 → 제목 표시(가로로 펼쳐짐)
  covered: boolean;   // 앞 칸에서 시작한 막대에 덮인 칸 → 투명 자리채움만
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
      if (lane >= usedLanes) {
        // 레인 한도 초과 → 걸친 날마다 overflow 집계
        for (let c = seg.startCol; c <= seg.endCol; c++) {
          const date = weekDates[c];
          overflowByDate.set(date, (overflowByDate.get(date) ?? 0) + 1);
        }
        continue;
      }
      // 시작 칸: span개 칸을 가로지르는 막대(제목 표시)
      slotsByDate.get(weekDates[seg.startCol])![lane] = {
        event: seg.event,
        span: seg.endCol - seg.startCol + 1,
        isStart: seg.isStart,
        isEnd: seg.isEnd,
        showTitle: true,
        covered: false,
      };
      // 이어지는 칸: 막대가 위로 덮으므로 투명 자리채움(레인 높이만 확보)
      for (let c = seg.startCol + 1; c <= seg.endCol; c++) {
        slotsByDate.get(weekDates[c])![lane] = {
          event: seg.event, span: 0, isStart: false, isEnd: false, showTitle: false, covered: true,
        };
      }
    }
  }

  return { slotsByDate, overflowByDate };
}

// ── 이벤트 유틸 ─────────────────────────────────────────────

/** 이벤트를 다른 날짜로 이동할 때 시간 보존 */
export function buildMovedTimeFields(ev: CalendarEvent, newDate: string) {
  if (ev.isAllDay) {
    // 종일 일정: 일수(end.date 배타적)를 보존하며 통째로 이동
    const startDate = ev.startTime?.slice(0, 10) ?? "";
    const endDate = ev.endTime?.slice(0, 10) ?? "";
    const spanDays = startDate && endDate
      ? Math.max(1, Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000))
      : 1;
    const [y, m, d] = newDate.split("-").map(Number);
    const end = new Date(y, m - 1, d + spanDays);
    return {
      start: {date: newDate},
      end: {date: isoDate(end.getFullYear(), end.getMonth(), end.getDate())},
    };
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
  date: string;     // 시작 날짜 (YYYY-MM-DD)
  endDate: string;  // 종료 날짜 (포함, YYYY-MM-DD) — 단일 일정이면 date와 동일
  isAllDay: boolean;
  startTime: string;
  endTime: string;
  location: string;
  calendarId: string;
  submitting: boolean;
}

export const EMPTY_FORM: EventForm = {
  open: false, editEventId: null, editCalendarId: null,
  title: "", date: "", endDate: "", isAllDay: false,
  startTime: "09:00", endTime: "10:00", location: "", calendarId: "primary", submitting: false,
};

/** 폼 날짜/시간 → Google start/end 필드. 종일은 end.date가 배타적이라 종료일+1.
 *  endDate가 비었거나 시작일보다 앞이면 시작일(단일)로 간주. */
export function buildEventTimeFields(
  form: Pick<EventForm, "isAllDay" | "date" | "endDate" | "startTime" | "endTime">
) {
  const start = form.date;
  const end = form.endDate && form.endDate >= form.date ? form.endDate : form.date;
  if (form.isAllDay) {
    const [y, m, d] = end.split("-").map(Number);
    const ex = new Date(y, m - 1, d + 1); // end.date 배타적 → 종료일 다음 날
    return {
      start: { date: start },
      end: { date: isoDate(ex.getFullYear(), ex.getMonth(), ex.getDate()) },
    };
  }
  return {
    start: { dateTime: `${start}T${form.startTime}:00`, timeZone: "Asia/Seoul" },
    end: { dateTime: `${end}T${form.endTime}:00`, timeZone: "Asia/Seoul" },
  };
}

/** 기존 일정 → 폼의 종료 날짜(포함). 종일은 end.date 배타적이라 -1일, 시간 일정은 종료 일시의 날짜. */
export function eventEndDateForForm(
  ev: { isAllDay: boolean; startTime: string; endTime?: string }
): string {
  const startDate = ev.startTime?.slice(0, 10) ?? "";
  if (!ev.endTime) return startDate;
  const endRaw = ev.endTime.slice(0, 10);
  if (!ev.isAllDay) return endRaw; // 시간 일정: 종료 일시의 날짜 그대로
  const [y, m, d] = endRaw.split("-").map(Number);
  const inc = new Date(y, m - 1, d - 1); // 종일: 배타적 end → 하루 빼서 포함 종료일
  const incStr = isoDate(inc.getFullYear(), inc.getMonth(), inc.getDate());
  return incStr >= startDate ? incStr : startDate;
}

const WHEN_DATE_OPTS = { month: "long", day: "numeric", weekday: "short" } as const;
const WHEN_TIME_OPTS = { hour: "2-digit", minute: "2-digit" } as const;

/** 상세 표시용 일시 라벨 — 종일/시간, 단일/여러 날(범위)을 모두 처리. */
export function formatEventWhen(ev: { isAllDay: boolean; startTime: string; endTime: string }): string {
  if (ev.isAllDay) {
    const startKey = ev.startTime.slice(0, 10);
    const endKey = eventEndDateForForm(ev); // 포함 종료일
    const startLabel = formatDateLabel(startKey);
    return startKey === endKey
      ? `${startLabel} (종일)`
      : `${startLabel} – ${formatDateLabel(endKey)} (종일)`;
  }
  const s = new Date(ev.startTime);
  const e = new Date(ev.endTime);
  const sDate = s.toLocaleDateString("ko-KR", WHEN_DATE_OPTS);
  const sTime = s.toLocaleTimeString("ko-KR", WHEN_TIME_OPTS);
  const eTime = e.toLocaleTimeString("ko-KR", WHEN_TIME_OPTS);
  if (s.toDateString() === e.toDateString()) {
    return `${sDate} ${sTime} – ${eTime}`;
  }
  // 자정 넘겨 다른 날 종료 → 종료 날짜도 표시
  return `${sDate} ${sTime} – ${e.toLocaleDateString("ko-KR", WHEN_DATE_OPTS)} ${eTime}`;
}
