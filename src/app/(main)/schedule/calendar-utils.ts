import { CalendarEvent } from "@/store/events";
import { ChecklistDraftItem } from "@/store/todos";
import { TodoTask } from "@/lib/microsoft-todo";
import { CalendarListItem } from "@/lib/google-calendar";

// ── 달력 그리드 계산 ────────────────────────────────────────

export function firstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
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

// ── 이벤트 유틸 ─────────────────────────────────────────────

export function getEventDateKey(ev: CalendarEvent): string {
  return ev.startTime.split("T")[0] ?? ev.startTime.slice(0, 10);
}

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

// ── 캘린더 매칭 (AI 빠른 추가) ──────────────────────────────

/** 이모지 제거 후 공백 정리 */
function stripEmoji(s: string): string {
  return s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}⭐★☆♥♦♣♠]/gu, "").trim();
}

/** AI가 반환한 calendarName을 실제 캘린더 목록에서 매칭 */
export function matchCalendar(name: string, calendars: CalendarListItem[]): CalendarListItem | undefined {
  if (!name) return undefined;
  // 1) 완전 일치
  const exact = calendars.find((c) => c.summary === name);
  if (exact) return exact;
  // 2) 이모지 제거 후 일치
  const stripped = stripEmoji(name);
  return calendars.find((c) => stripEmoji(c.summary) === stripped || c.summary.includes(stripped));
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

// ── 할일 폼 ─────────────────────────────────────────────────

export interface TodoFormState {
  open: boolean;
  mode: "create" | "edit";
  listId: string;
  taskId?: string;
  title: string;
  dueDate: string;
  importance: "normal" | "high";
  memo: string;
  repeatEnabled: boolean;
  repeatType: "daily" | "weekly" | "absoluteMonthly" | "absoluteYearly";
  repeatInterval: number;
  checklistItems: ChecklistDraftItem[];
}

export const EMPTY_TODO_FORM: TodoFormState = {
  open: false, mode: "create", listId: "", taskId: undefined,
  title: "", dueDate: "", importance: "normal", memo: "",
  repeatEnabled: false, repeatType: "daily", repeatInterval: 1, checklistItems: [],
};

export function recurrenceLabel(type: TodoFormState["repeatType"]): string {
  if (type === "daily") return "매일";
  if (type === "weekly") return "매주";
  if (type === "absoluteMonthly") return "매월";
  return "매년";
}

function graphDayOfWeek(date: string): string {
  const day = new Date(date + "T00:00:00").getDay();
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][day];
}

export function buildTodoRecurrence(form: TodoFormState): TodoTask["recurrence"] | null | undefined {
  if (!form.repeatEnabled) return form.mode === "edit" ? null : undefined;
  const startDate = form.dueDate || new Date().toISOString().split("T")[0];
  return {
    pattern: {
      type: form.repeatType,
      interval: Math.max(1, form.repeatInterval || 1),
      ...(form.repeatType === "weekly" ? {daysOfWeek: [graphDayOfWeek(startDate)]} : {}),
    },
    range: {type: "noEnd", startDate},
  } as TodoTask["recurrence"];
}
