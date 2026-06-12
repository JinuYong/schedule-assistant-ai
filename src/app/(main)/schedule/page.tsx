"use client";

import {useEffect, useState, useCallback, useMemo, useRef} from "react";
import {useAuthStore} from "@/store/auth";
import {useEventsStore, CalendarEvent} from "@/store/events";
import {ChecklistDraftItem, useTodosStore, TodoItem} from "@/store/todos";
import {TodoTask, TodoTaskUpdates} from "@/lib/microsoft-todo";
import {parseScheduleText} from "@/lib/claude";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  getCalendarList,
  clearCalendarListCache,
  CalendarListItem
} from "@/lib/google-calendar";
import {listen} from "@tauri-apps/api/event";
import {formatDue} from "@/lib/date-utils";
import {isTauri} from "@/lib/tauri-store";
import {showToast} from "@/store/toast";
import Divider from "@/components/divider";
import styles from "./page.module.css";
import UnavailableContent from '@/components/unavailable-content'

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const DEFAULT_SIDE_WIDTH = 280;
const MIN_SIDE_WIDTH = 200;
const MAX_SIDE_WIDTH = 500;

function IconChevronLeft() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 1L1 7l6 6"/>
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 1l6 6-6 6"/>
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6"/>
      <path d="M21 13a9 9 0 1 1-3-7.7L21 8"/>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round">
      <path d="M5 1v8M1 5h8"/>
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 1.5l2 2L4 11H2V9l7.5-7.5z"/>
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6"/>
      <path d="M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  );
}

function IconStar({filled}: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round"
         strokeLinejoin="round" fill={filled ? "currentColor" : "none"} stroke="currentColor"
         className={filled ? styles.iconStarFilled : styles.iconStar}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  );
}

function IconRepeat() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className={styles.iconRepeat}>
      <path d="M17 1l4 4-4 4"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <path d="M7 23l-4-4 4-4"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  );
}

function IconChevron({open}: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round"
         className={`${styles.chevron}${open ? ` ${styles.chevronOpen}` : ""}`}>
      <path d="M2 4l4 4 4-4"/>
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round">
      <path d="M1 1l9 9M10 1L1 10"/>
    </svg>
  );
}

function firstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function getTodayInfo() {
  const today = new Date();
  return {
    year: today.getFullYear(),
    month: today.getMonth(),
    date: isoDate(today.getFullYear(), today.getMonth(), today.getDate()),
  };
}

function msUntilNextDay(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 1000;
}

function formatMonthYear(y: number, m: number): string {
  return new Date(y, m, 1).toLocaleDateString("ko-KR", {year: "numeric", month: "long"});
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("ko-KR", date.getMinutes() === 0 ? {hour: 'numeric'} : {hour: 'numeric', minute: "2-digit"});
}

function formatDateLabel(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("ko-KR", {
    month: "long", day: "numeric", weekday: "short",
  });
}

function recurrenceLabel(type: TodoFormState["repeatType"]): string {
  if (type === "daily") return "매일";
  if (type === "weekly") return "매주";
  if (type === "absoluteMonthly") return "매월";
  return "매년";
}

function graphDayOfWeek(date: string): string {
  const day = new Date(date + "T00:00:00").getDay();
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][day];
}

function buildTodoRecurrence(form: TodoFormState): TodoTask["recurrence"] | null | undefined {
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


function getEventDateKey(ev: CalendarEvent): string {
  return ev.startTime.split("T")[0] ?? ev.startTime.slice(0, 10);
}

interface CalCell {
  date: string;
  day: number;
  inMonth: boolean;
  isSunday: boolean;
}

function buildCells(year: number, month: number): CalCell[] {
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

/** 이벤트를 다른 날짜로 이동할 때 시간 보존 */
function buildMovedTimeFields(ev: CalendarEvent, newDate: string) {
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

/** 이모지 제거 후 공백 정리 */
function stripEmoji(s: string): string {
  return s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}⭐★☆♥♦♣♠]/gu, "").trim();
}

/** AI가 반환한 calendarName을 실제 캘린더 목록에서 매칭 */
function matchCalendar(name: string, calendars: CalendarListItem[]): CalendarListItem | undefined {
  if (!name) return undefined;
  // 1) 완전 일치
  const exact = calendars.find((c) => c.summary === name);
  if (exact) return exact;
  // 2) 이모지 제거 후 일치
  const stripped = stripEmoji(name);
  return calendars.find((c) => stripEmoji(c.summary) === stripped || c.summary.includes(stripped));
}

interface EventForm {
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

const EMPTY_FORM: EventForm = {
  open: false, editEventId: null, editCalendarId: null,
  title: "", date: "", isAllDay: false,
  startTime: "09:00", endTime: "10:00", location: "", calendarId: "primary", submitting: false,
};

interface TodoFormState {
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

const EMPTY_TODO_FORM: TodoFormState = {
  open: false, mode: "create", listId: "", taskId: undefined,
  title: "", dueDate: "", importance: "normal", memo: "",
  repeatEnabled: false, repeatType: "daily", repeatInterval: 1, checklistItems: [],
};

export default function SchedulePage() {
  const {googleTokens, microsoftTokens, refreshGoogle, refreshMicrosoft} = useAuthStore();
  const {events, isLoading, error, fetchEvents, prefetchEvents, invalidateCache} = useEventsStore();
  const {
    todos, isLoading: todosLoading, error: todosError, fetchTodos,
    createTodo, updateTodo, deleteTodo, completeTodo, toggleImportance, toggleChecklistItem
  } = useTodosStore();

  const [todayInfo, setTodayInfo] = useState(getTodayInfo);
  const [currentYear, setCurrentYear] = useState(todayInfo.year);
  const [currentMonth, setCurrentMonth] = useState(todayInfo.month);
  const [selectedDate, setSelectedDate] = useState<string>(todayInfo.date);
  const [calendars, setCalendars] = useState<CalendarListItem[]>([]);
  const [quickInput, setQuickInput] = useState("");
  const [quickStatus, setQuickStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<EventForm>(EMPTY_FORM);
  const [todoForm, setTodoForm] = useState<TodoFormState>(EMPTY_TODO_FORM);
  const [todoSubmitting, setTodoSubmitting] = useState(false);
  const [expandedTodos, setExpandedTodos] = useState<Set<string>>(new Set());
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [draggingEvent, setDraggingEvent] = useState<CalendarEvent | null>(null);
  const [ghostPos, setGhostPos] = useState({x: 0, y: 0});
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const dragStateRef = useRef<CalendarEvent | null>(null);
  const dropHandlerRef = useRef<(ev: CalendarEvent, targetDate: string) => void>(() => {
  });
  const dragStartPosRef = useRef({x: 0, y: 0});
  const hasDragMovedRef = useRef(false);
  const wheelCooldownRef = useRef(false);
  const wheelJustReleasedRef = useRef(false);
  const lastAbsDeltaRef = useRef(0);
  const cooldownStartRef = useRef(0);

  const refreshTodayInfo = useCallback(() => {
    const nextToday = getTodayInfo();
    setTodayInfo((prev) => prev.date === nextToday.date ? prev : nextToday);
    return nextToday;
  }, []);

  const goToToday = useCallback(() => {
    const nextToday = refreshTodayInfo();
    setCurrentYear(nextToday.year);
    setCurrentMonth(nextToday.month);
    setSelectedDate(nextToday.date);
  }, [refreshTodayInfo]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleMidnightRefresh = () => {
      timeoutId = setTimeout(() => {
        refreshTodayInfo();
        scheduleMidnightRefresh();
      }, msUntilNextDay());
    };

    const handleFocus = () => {
      refreshTodayInfo();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) refreshTodayInfo();
    };

    scheduleMidnightRefresh();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshTodayInfo]);

  // 우측 패널 너비 (드래그 리사이즈)
  const [sidePanelWidth, setSidePanelWidth] = useState(DEFAULT_SIDE_WIDTH);
  const sideDragRef = useRef({ x: 0, width: DEFAULT_SIDE_WIDTH });

  // 우측 패널 너비 localStorage 복원
  useEffect(() => {
    const saved = localStorage.getItem("schedule-side-width");
    if (saved) setSidePanelWidth(Math.max(MIN_SIDE_WIDTH, Math.min(MAX_SIDE_WIDTH, Number(saved))));
  }, []);

  const handleSidePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    sideDragRef.current = { x: e.clientX, width: sidePanelWidth };
    document.body.style.cursor = "col-resize";
  }, [sidePanelWidth]);

  const handleSidePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const { x: startX, width: startWidth } = sideDragRef.current;
    // 왼쪽으로 드래그 → 패널 넓어짐 (delta 반전)
    const newWidth = Math.min(MAX_SIDE_WIDTH, Math.max(MIN_SIDE_WIDTH, startWidth - (e.clientX - startX)));
    setSidePanelWidth(newWidth);
  }, []);

  const handleSidePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.cursor = "";
    setSidePanelWidth((w) => {
      localStorage.setItem("schedule-side-width", String(w));
      return w;
    });
  }, []);

  // 캘린더 목록 로드
  useEffect(() => {
    if (!googleTokens) return;
    (async () => {
      const tokens = await refreshGoogle();
      if (tokens?.access_token) {
        const list = await getCalendarList(tokens.access_token).catch(() => []);
        setCalendars(list);
      }
    })();
  }, [googleTokens?.access_token]); // eslint-disable-line

  // 월별 이벤트 로드 + 인접 달 백그라운드 프리페치
  useEffect(() => {
    if (!googleTokens) return;
    (async () => {
      const tokens = await refreshGoogle();
      if (!tokens?.access_token) return;

      await fetchEvents(tokens.access_token, gridRange.timeMin, gridRange.timeMax);

      // 앞뒤 달 프리페치 (fire-and-forget)
      const prevY = currentMonth === 0 ? currentYear - 1 : currentYear;
      const prevM = currentMonth === 0 ? 11 : currentMonth - 1;
      const nextY = currentMonth === 11 ? currentYear + 1 : currentYear;
      const nextM = currentMonth === 11 ? 0 : currentMonth + 1;
      const prevCells = buildCells(prevY, prevM);
      const nextCells = buildCells(nextY, nextM);
      void prefetchEvents(tokens.access_token, new Date(prevCells[0].date + "T00:00:00").toISOString(), new Date(prevCells[prevCells.length - 1].date + "T23:59:59").toISOString());
      void prefetchEvents(tokens.access_token, new Date(nextCells[0].date + "T00:00:00").toISOString(), new Date(nextCells[nextCells.length - 1].date + "T23:59:59").toISOString());
    })();
  }, [googleTokens?.access_token, currentYear, currentMonth]); // eslint-disable-line

  // Microsoft Todo 로드 — refreshMicrosoft() 거치지 않고 저장된 토큰 직접 사용
  // (refresh 중 Rust invoke 실패 시 fetchTodos가 아예 호출되지 않는 문제 방지)
  useEffect(() => {
    if (!microsoftTokens?.access_token) return;
    fetchTodos(microsoftTokens.access_token);
  }, [microsoftTokens?.access_token]); // eslint-disable-line

  const cells = useMemo(() => buildCells(currentYear, currentMonth), [currentYear, currentMonth]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = getEventDateKey(ev);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [events]);

  const selectedEvents = useMemo(
    () => (eventsByDate.get(selectedDate) ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [eventsByDate, selectedDate]
  );

  const primaryCalendarId = useMemo(
    () => calendars.find((c) => c.primary)?.id ?? "primary",
    [calendars]
  );

  /** 현재 그리드에 실제로 표시되는 날짜 범위 (RFC 3339, UTC ISO) */
  const gridRange = useMemo(() => ({
    timeMin: new Date(cells[0].date + "T00:00:00").toISOString(),
    timeMax: new Date(cells[cells.length - 1].date + "T23:59:59").toISOString(),
  }), [cells]);

  // gridRange stale closure 방지용 ref
  const gridRangeRef = useRef(gridRange);
  useEffect(() => {
    gridRangeRef.current = gridRange;
  }, [gridRange]);

  // 플로팅 창 등 외부에서 일정 추가 시 → 캐시 초기화 후 현재 달 재조회
  useEffect(() => {
    if (!isTauri() || !googleTokens) return;
    let unlisten: (() => void) | undefined;
    listen("calendar-mutated", async () => {
      invalidateCache();
      const tokens = await refreshGoogle();
      if (tokens?.access_token) {
        await fetchEvents(tokens.access_token, gridRangeRef.current.timeMin, gridRangeRef.current.timeMax);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [googleTokens?.access_token]); // eslint-disable-line

  const prevMonth = useCallback(() => {
    const newYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const newMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const currentDay = Number(selectedDate.split("-")[2]);
    const day = Math.min(currentDay, daysInMonth(newYear, newMonth));
    setCurrentYear(newYear);
    setCurrentMonth(newMonth);
    setSelectedDate(isoDate(newYear, newMonth, day));
  }, [currentMonth, currentYear, selectedDate]);

  const nextMonth = useCallback(() => {
    const newYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const newMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const currentDay = Number(selectedDate.split("-")[2]);
    const day = Math.min(currentDay, daysInMonth(newYear, newMonth));
    setCurrentYear(newYear);
    setCurrentMonth(newMonth);
    setSelectedDate(isoDate(newYear, newMonth, day));
  }, [currentMonth, currentYear, selectedDate]);

  const openEventForm = useCallback((date: string) => {
    setEventForm({...EMPTY_FORM, open: true, date, calendarId: primaryCalendarId});
  }, [primaryCalendarId]);

  const openEditForm = useCallback((ev: CalendarEvent) => {
    const dateStr = ev.startTime.split("T")[0];
    const startT = ev.isAllDay ? "09:00" : new Date(ev.startTime).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const endT = ev.isAllDay ? "10:00" : new Date(ev.endTime).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const calId = ev.calendarId ?? primaryCalendarId;
    setEventForm({
      open: true, editEventId: ev.id, editCalendarId: calId,
      title: ev.title, date: dateStr, isAllDay: ev.isAllDay,
      startTime: startT, endTime: endT,
      location: ev.location ?? "", calendarId: calId, submitting: false,
    });
  }, [primaryCalendarId]);

  const closeEventForm = useCallback(() => setEventForm(EMPTY_FORM), []);

  const handleRefreshAll = useCallback(async () => {
    clearCalendarListCache();
    const [g, m] = await Promise.all([refreshGoogle(), refreshMicrosoft()]);
    const p: Promise<void>[] = [];
    if (g?.access_token) p.push(fetchEvents(g.access_token, gridRange.timeMin, gridRange.timeMax));
    if (m?.access_token) p.push(fetchTodos(m.access_token));
    await Promise.all(p);
  }, [refreshGoogle, refreshMicrosoft, fetchEvents, fetchTodos, gridRange]);

  const handleQuickAdd = useCallback(async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const text = quickInput.trim();
    if (!text || quickStatus === "loading") return;
    setQuickStatus("loading");
    try {
      const tokens = await refreshGoogle();
      if (!tokens?.access_token) throw new Error("Google 계정 연결이 필요합니다.");
      const now = new Date().toLocaleString("ko-KR", {timeZone: "Asia/Seoul"});
      const calendarNames = calendars.map((c) => c.summary);
      const parsed = await parseScheduleText(text, now, calendarNames);
      if (!parsed) throw new Error("파싱 실패");

      // 캘린더 매칭
      const matched = parsed.calendarName ? matchCalendar(parsed.calendarName, calendars) : undefined;
      const calendarId = matched?.id ?? primaryCalendarId;

      await createEvent(tokens.access_token, {
        id: "",
        summary: parsed.title,
        description: parsed.description,
        location: parsed.location,
        ...(parsed.isAllDay
          ? {start: {date: parsed.startTime.split("T")[0]}, end: {date: parsed.endTime.split("T")[0]}}
          : {
            start: {dateTime: parsed.startTime, timeZone: "Asia/Seoul"},
            end: {dateTime: parsed.endTime, timeZone: "Asia/Seoul"}
          }),
      }, calendarId);

      setQuickInput("");
      setQuickStatus("done");
      invalidateCache();
      await fetchEvents(tokens.access_token, gridRange.timeMin, gridRange.timeMax);
      setTimeout(() => setQuickStatus("idle"), 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "일정 추가에 실패했습니다.";
      showToast(msg);
      setQuickStatus("error");
      setTimeout(() => setQuickStatus("idle"), 2000);
    }
  }, [quickInput, quickStatus, refreshGoogle, fetchEvents, gridRange, calendars, primaryCalendarId]);

  const handleEventFormSubmit = useCallback(async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!eventForm.title.trim() || eventForm.submitting) return;
    setEventForm((f) => ({...f, submitting: true}));
    try {
      const tokens = await refreshGoogle();
      if (!tokens?.access_token) throw new Error("Google 계정 연결이 필요합니다.");
      const timeFields = eventForm.isAllDay
        ? {start: {date: eventForm.date}, end: {date: eventForm.date}}
        : {
          start: {dateTime: `${eventForm.date}T${eventForm.startTime}:00`, timeZone: "Asia/Seoul"},
          end: {dateTime: `${eventForm.date}T${eventForm.endTime}:00`, timeZone: "Asia/Seoul"},
        };

      if (eventForm.editEventId) {
        // 수정
        await updateEvent(tokens.access_token, eventForm.editEventId, {
          summary: eventForm.title,
          location: eventForm.location || undefined,
          ...timeFields,
        }, eventForm.editCalendarId ?? "primary");
      } else {
        // 신규
        await createEvent(tokens.access_token, {
          id: "", summary: eventForm.title,
          location: eventForm.location || undefined,
          ...timeFields,
        }, eventForm.calendarId);
      }
      invalidateCache();
      await fetchEvents(tokens.access_token, gridRange.timeMin, gridRange.timeMax);
      setSelectedDate(eventForm.date);
      closeEventForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "일정 저장에 실패했습니다.";
      showToast(msg);
      setEventForm((f) => ({...f, submitting: false}));
    }
  }, [eventForm, refreshGoogle, fetchEvents, invalidateCache, gridRange, closeEventForm]);

  const handleDeleteEvent = useCallback(async (ev: CalendarEvent) => {
    setDeletingId(ev.id);
    try {
      const tokens = await refreshGoogle();
      if (!tokens?.access_token) return;
      await deleteEvent(tokens.access_token, ev.id, ev.calendarId ?? "primary");
      invalidateCache();
      await fetchEvents(tokens.access_token, gridRange.timeMin, gridRange.timeMax);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "일정 삭제에 실패했습니다.";
      showToast(msg);
    } finally {
      setDeletingId(null);
    }
  }, [refreshGoogle, fetchEvents, invalidateCache, gridRange]);

  const handleDropEvent = useCallback(async (ev: CalendarEvent, targetDate: string) => {
    try {
      const tokens = await refreshGoogle();
      if (!tokens?.access_token) return;
      await updateEvent(tokens.access_token, ev.id, buildMovedTimeFields(ev, targetDate), ev.calendarId ?? "primary");
      invalidateCache();
      await fetchEvents(tokens.access_token, gridRange.timeMin, gridRange.timeMax);
      setSelectedDate(targetDate);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "일정 이동에 실패했습니다.";
      showToast(msg);
    }
  }, [refreshGoogle, fetchEvents, invalidateCache, gridRange]);

  // ref를 항상 최신 함수로 유지 (useEffect 내 stale closure 방지)
  dropHandlerRef.current = handleDropEvent;

  // 드래그 중 document 레벨 마우스 이벤트 (HTML5 DnD 대신 마우스 이벤트 사용)
  useEffect(() => {
    if (!draggingEvent) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      if (!hasDragMovedRef.current && Math.sqrt(dx * dx + dy * dy) > 6) {
        hasDragMovedRef.current = true;
      }
      setGhostPos({x: e.clientX, y: e.clientY});
      const el = document.elementFromPoint(e.clientX, e.clientY);
      setDragOverDate(el?.closest<HTMLElement>("[data-date]")?.dataset.date ?? null);
    };

    const onUp = (e: MouseEvent) => {
      const ev = dragStateRef.current;
      dragStateRef.current = null;
      setDraggingEvent(null);
      setDragOverDate(null);

      if (!hasDragMovedRef.current) {
        // 클릭(드래그 없음) → 상세 모달 표시
        if (ev) setDetailEvent(ev);
        return;
      }

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const targetDate = el?.closest<HTMLElement>("[data-date]")?.dataset.date ?? null;
      if (ev && targetDate && targetDate !== getEventDateKey(ev)) {
        dropHandlerRef.current(ev, targetDate);
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [draggingEvent]); // eslint-disable-line

  const handleCompleteTodo = useCallback(async (todo: TodoItem) => {
    const tokens = await refreshMicrosoft();
    if (!tokens?.access_token) return;
    await completeTodo(tokens.access_token, todo.listId, todo.id);
  }, [refreshMicrosoft, completeTodo]);

  const handleToggleTodoImportance = useCallback(async (e: React.MouseEvent, todo: TodoItem) => {
    e.stopPropagation();
    const tokens = await refreshMicrosoft();
    if (!tokens?.access_token) return;
    await toggleImportance(tokens.access_token, todo.listId, todo.id, todo.importance);
  }, [refreshMicrosoft, toggleImportance]);

  const handleDeleteTodo = useCallback(async (e: React.MouseEvent, todo: TodoItem) => {
    e.stopPropagation();
    const tokens = await refreshMicrosoft();
    if (!tokens?.access_token) return;
    await deleteTodo(tokens.access_token, todo.listId, todo.id);
  }, [refreshMicrosoft, deleteTodo]);

  const handleToggleTodoChecklist = useCallback(async (todo: TodoItem, itemId: string, isChecked: boolean) => {
    const tokens = await refreshMicrosoft();
    if (!tokens?.access_token) return;
    await toggleChecklistItem(tokens.access_token, todo.listId, todo.id, itemId, isChecked);
  }, [refreshMicrosoft, toggleChecklistItem]);

  const toggleTodoExpand = useCallback((id: string) => {
    setExpandedTodos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // 할일의 고유 리스트 목록 (listId → listName)
  const todoLists = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of todos) map.set(t.listId, t.listName);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [todos]);

  const openTodoForm = useCallback((listId?: string) => {
    const defaultList = listId ?? todoLists[0]?.id ?? "";
    setTodoForm({
      ...EMPTY_TODO_FORM,
      open: true,
      mode: "create",
      listId: defaultList,
      dueDate: selectedDate,
    });
  }, [todoLists, selectedDate]);

  const openTodoEditForm = useCallback((e: React.MouseEvent, todo: TodoItem) => {
    e.stopPropagation();
    setTodoForm({
      open: true,
      mode: "edit",
      listId: todo.listId,
      taskId: todo.id,
      title: todo.title,
      dueDate: todo.dueDateTime?.dateTime.split("T")[0] ?? "",
      importance: todo.importance === "high" ? "high" : "normal",
      memo: todo.body?.content ?? "",
      repeatEnabled: !!todo.recurrence,
      repeatType: (
        todo.recurrence?.pattern.type === "weekly" ||
        todo.recurrence?.pattern.type === "absoluteMonthly" ||
        todo.recurrence?.pattern.type === "absoluteYearly"
      ) ? todo.recurrence.pattern.type : "daily",
      repeatInterval: todo.recurrence?.pattern.interval ?? 1,
      checklistItems: todo.checklistItems?.map((item) => ({
        id: item.id,
        displayName: item.displayName,
        isChecked: item.isChecked,
      })) ?? [],
    });
  }, []);

  const closeTodoForm = useCallback(() => setTodoForm(EMPTY_TODO_FORM), []);

  const handleTodoSubmit = useCallback(async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!todoForm.title.trim() || !todoForm.listId || !microsoftTokens?.access_token) return;
    setTodoSubmitting(true);
    try {
      const dueDateTime = todoForm.dueDate
        ? { dateTime: `${todoForm.dueDate}T00:00:00.0000000`, timeZone: "UTC" }
        : undefined;
      const task: TodoTaskUpdates & Pick<TodoTask, "title"> = {
        title: todoForm.title.trim(),
        importance: todoForm.importance,
        recurrence: buildTodoRecurrence(todoForm),
        ...(dueDateTime ? {dueDateTime} : {}),
        ...(todoForm.memo.trim() ? {body: {content: todoForm.memo.trim(), contentType: "text" as const}} : {}),
      };
      const checklistItems = todoForm.checklistItems.filter((item) => item.displayName.trim());
      if (todoForm.mode === "create") {
        await createTodo(microsoftTokens.access_token, todoForm.listId, task as Parameters<typeof createTodo>[2], checklistItems);
      } else if (todoForm.taskId) {
        await updateTodo(microsoftTokens.access_token, todoForm.listId, todoForm.taskId, task, checklistItems);
      }
      closeTodoForm();
    } finally {
      setTodoSubmitting(false);
    }
  }, [todoForm, microsoftTokens, createTodo, updateTodo, closeTodoForm]);

  const dueTodoGroups = useMemo(() => {
    const map = new Map<string, { listId: string; listName: string; items: TodoItem[] }>();
    for (const todo of todos.filter((t) => t.dueDateTime)) {
      if (!map.has(todo.listId)) map.set(todo.listId, {listId: todo.listId, listName: todo.listName, items: []});
      map.get(todo.listId)!.items.push(todo);
    }
    return Array.from(map.values());
  }, [todos]);

  const renderTodoGroups = useCallback((
    groups: { listId: string; listName: string; items: TodoItem[] }[],
    emptyMessage: string
  ) => (
    <>
      {todosError && <p className={styles.error}>{todosError}</p>}
      {todosLoading && <p className={styles.empty}>불러오는 중...</p>}
      {!todosLoading && groups.length === 0 && <p className={styles.empty}>{emptyMessage}</p>}
      <div className={styles.todoGroups}>
        {groups.map(({listId, listName, items}) => (
          <section key={listId} className={styles.todoGroup}>
            <div className={styles.todoGroupHeader}>
              <h3 className={styles.todoGroupName}>{listName}</h3>
            </div>
            <ul className={styles.todoAccordionList}>
              {items.map((todo) => {
                const due = todo.dueDateTime ? formatDue(todo.dueDateTime.dateTime, todo.dueDateTime.timeZone) : null;
                const hasAccordion = (todo.checklistItems?.length ?? 0) > 0 || !!todo.body?.content?.trim();
                const isOpen = expandedTodos.has(todo.id);
                return (
                  <li key={todo.id} className={styles.todoAccordionItem}>
                    <div
                      className={`${styles.todoAccordionRow}${hasAccordion ? ` ${styles.todoAccordionRowClickable}` : ""}`}
                      onClick={() => hasAccordion && toggleTodoExpand(todo.id)}
                    >
                      <button className={styles.todoCheckBtn} onClick={(e) => {
                        e.stopPropagation();
                        handleCompleteTodo(todo);
                      }} title="완료"/>
                      <div className={styles.todoAccordionMain}>
                        <div className={styles.todoAccordionTopLine}>
                          <p className={styles.todoAccordionText}>{todo.title}</p>
                          <div className={styles.todoActionBtns}>
                            <button className={styles.todoActionBtn} onClick={(e) => openTodoEditForm(e, todo)} title="수정">
                              <IconPencil/>
                            </button>
                            <button className={`${styles.todoActionBtn} ${styles.todoDeleteBtn}`}
                                    onClick={(e) => handleDeleteTodo(e, todo)} title="삭제">
                              <IconTrash/>
                            </button>
                          </div>
                          {todo.recurrence && <IconRepeat/>}
                          <button className={styles.todoStarBtn} onClick={(e) => handleToggleTodoImportance(e, todo)}
                                  title={todo.importance === "high" ? "즐겨찾기 해제" : "즐겨찾기"}>
                            <IconStar filled={todo.importance === "high"}/>
                          </button>
                          <span className={styles.todoChevronSlot}>{hasAccordion && <IconChevron open={isOpen}/>}</span>
                        </div>
                        <div className={styles.todoAccordionMeta}>
                          {due && <span className={`${styles.todoDue}${due.isPast ? ` ${styles.todoDueOverdue}` : ""}`}>{due.label}</span>}
                        </div>
                      </div>
                    </div>
                    {hasAccordion && isOpen && (
                      <div className={styles.todoAccordionBody}>
                        {todo.body?.content?.trim() && (
                          todo.body.contentType === "html"
                            ? <div className={styles.todoBodyNote} dangerouslySetInnerHTML={{__html: todo.body.content}}/>
                            : <p className={styles.todoBodyNote}>{todo.body.content}</p>
                        )}
                        {(todo.checklistItems?.length ?? 0) > 0 && (
                          <ul className={styles.todoChecklistItems}>
                            {todo.checklistItems!.map((item) => (
                              <li key={item.id} className={styles.todoChecklistItem}>
                                <button
                                  className={`${styles.todoChecklistBtn}${item.isChecked ? ` ${styles.todoChecklistChecked}` : ""}`}
                                  onClick={() => handleToggleTodoChecklist(todo, item.id, !item.isChecked)}
                                  title={item.isChecked ? "완료 취소" : "완료"}
                                />
                                <span className={`${styles.todoChecklistText}${item.isChecked ? ` ${styles.todoChecklistDone}` : ""}`}>
                                  {item.displayName}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  ), [
    todosError, todosLoading, expandedTodos, openTodoForm, toggleTodoExpand,
    handleCompleteTodo, openTodoEditForm, handleDeleteTodo, handleToggleTodoImportance, handleToggleTodoChecklist
  ]);

  if (!googleTokens) {
    return (
      <div className={styles.container}>
        <UnavailableContent type="GOOGLE" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 자연어 빠른 추가 */}
      <form className={styles.quickAddForm} onSubmit={handleQuickAdd}>
        <input
          className={styles.quickAddInput}
          value={quickInput}
          onChange={(e) => setQuickInput(e.target.value)}
          placeholder="자연어로 일정 추가 (예: 내일 오후 3시 팀 미팅 회사 캘린더에)"
          disabled={quickStatus === "loading"}
        />
        <button className={styles.quickAddBtn} type="submit"
                disabled={!quickInput.trim() || quickStatus === "loading"}>
          {quickStatus === "loading" ? "분석 중..." : quickStatus === "done" ? "완료 ✓" : quickStatus === "error" ? "오류 ✗" : "추가"}
        </button>
      </form>

      {/* 달력(좌) + 일정·할일(우) 2컬럼 레이아웃 */}
        <div className={styles.mainLayout} style={{ gridTemplateColumns: `1fr ${sidePanelWidth}px` }}>
          {/* ── 좌측: 달력 ── */}
          <div className={styles.calendarColumn}>
            <div className={styles.calendarHeader}>
              <button className={styles.navBtn} onClick={prevMonth}><IconChevronLeft/></button>
              <h2 className={styles.monthTitle}>{formatMonthYear(currentYear, currentMonth)}</h2>
              <button className={styles.navBtn} onClick={nextMonth}><IconChevronRight/></button>
              <button className={styles.todayBtn} onClick={goToToday}>오늘</button>
              <div className={styles.refreshGroup}>
                {isLoading && <span className={styles.loadingDot}/>}
                <button type="button" className={styles.refreshBtn} onClick={handleRefreshAll} disabled={isLoading || todosLoading} title="새로고침"><IconRefresh/></button>
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <div
              className={styles.calendar}
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaX;
                const absDelta = Math.abs(delta);
                // 감속 감지: delta가 이전의 70% 미만 + 최소 100ms 경과 → 스와이프 끝으로 판단, 쿨다운 해제
                if (wheelCooldownRef.current && lastAbsDeltaRef.current > 0 && absDelta < lastAbsDeltaRef.current * 0.7 && Date.now() - cooldownStartRef.current > 100) {
                  wheelCooldownRef.current = false;
                  wheelJustReleasedRef.current = true;
                  lastAbsDeltaRef.current = 0;
                  setTimeout(() => { wheelJustReleasedRef.current = false; }, 50);
                  return;
                }
                lastAbsDeltaRef.current = absDelta;
                if (absDelta < 30) return;
                if (wheelCooldownRef.current || wheelJustReleasedRef.current) return;
                wheelCooldownRef.current = true;
                cooldownStartRef.current = Date.now();
                lastAbsDeltaRef.current = absDelta;
                if (delta > 0) nextMonth(); else prevMonth();
              }}
            >
              <div className={styles.weekdays}>
                {WEEKDAYS.map((wd, i) => (
                  <div key={wd} className={`${styles.weekdayHeader}${i === 6 ? ` ${styles.sundayLabel}` : ""}`}>{wd}</div>
                ))}
              </div>
              <div className={styles.dayCells}>
                {cells.map(({date, day, inMonth, isSunday}) => {
                  const isToday = date === todayInfo.date;
                  const isSelected = date === selectedDate;
                  const dayEvs = eventsByDate.get(date) ?? [];
                  const shown = dayEvs.slice(0, 3);
                  const extra = dayEvs.length - shown.length;
                  const cls = [
                    styles.dayCell,
                    !inMonth ? styles.otherMonth : "",
                    isToday ? styles.todayCell : "",
                    isSelected ? styles.selectedCell : "",
                    isSunday ? styles.sundayCell : "",
                  ].filter(Boolean).join(" ");

                  const isDragOver = dragOverDate === date;

                  return (
                    <div
                      key={date}
                      data-date={date}
                      className={`${cls}${isDragOver ? ` ${styles.dragOverCell}` : ""}`}
                      onClick={() => {
                        if (!draggingEvent) {
                          setSelectedDate(date);
                          // openEventForm(date);
                        }
                      }}
                    >
                      <span className={styles.dayNumber}>{day}</span>
                      {inMonth && (
                        <button
                          className={styles.cellAddBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEventForm(date);
                          }}
                          title="일정 추가"
                        >
                          <IconPlus/>
                        </button>
                      )}
                      {shown.map((ev) => (
                        <span
                          key={ev.id}
                          className={`${styles.eventChip}${draggingEvent?.id === ev.id ? ` ${styles.draggingChip}` : ""}`}
                          style={ev.calendarColor ? {background: ev.description === "공휴일" ? "#c44343" : ev.calendarColor, color: "#fff"} : undefined}
                          onClick={(e) => { e.stopPropagation(); setSelectedDate(date); setDetailEvent(ev); }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            dragStateRef.current = ev;
                            dragStartPosRef.current = {x: e.clientX, y: e.clientY};
                            hasDragMovedRef.current = false;
                            setDraggingEvent(ev);
                            setGhostPos({x: e.clientX, y: e.clientY});
                          }}
                        >
                        {ev.isAllDay ? "" : `${formatTime(ev.startTime)} `}{ev.title}
                      </span>
                      ))}
                      {extra > 0 && <span className={styles.moreEvents}>+{extra}</span>}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>{/* calendarColumn end */}

          {/* ── 우측: 선택된 날 일정 + 할일 ── */}
          <div className={styles.sidePanel}>
            <div
              className={styles.sidePanelHandle}
              onPointerDown={handleSidePointerDown}
              onPointerMove={handleSidePointerMove}
              onPointerUp={handleSidePointerUp}
            />
            <div className={styles.sidePanelContent}>
              <h2 className={styles.dayTitle}>{formatDateLabel(selectedDate)}</h2>
              <section>
                <div className={styles.dayDetailHeader}>
                  <h3 className={styles.dayDetailTitle}>일정</h3>
                  <button className={styles.dayAddBtn} onClick={() => openEventForm(selectedDate)}><IconPlus/> 추가</button>
                </div>
                <ul className={styles.eventList}>
                  {isLoading ? (<p className={styles.empty}>loading...</p>) :
                    selectedEvents.length === 0 ? (<p className={styles.empty}>일정이 없습니다.</p>) : selectedEvents.map((ev) => (
                      <li
                        key={ev.id}
                        className={styles.eventItem}
                        style={ev.calendarColor ? {borderLeftColor: ev.calendarColor} : undefined}
                        onClick={() => setDetailEvent(ev)}
                      >
                      <span className={styles.eventTime} style={ev.calendarColor ? {color: ev.calendarColor} : undefined}>
                        {ev.isAllDay ? "종일" : formatTime(ev.startTime)}
                      </span>
                        <div className={styles.eventBody}>
                          <p className={styles.eventTitle}>{ev.title}</p>
                          {ev.location && <p className={styles.eventMeta}>📍 {ev.location}</p>}
                        </div>
                        <button className={styles.editBtn} onClick={(e) => {
                          e.stopPropagation();
                          openEditForm(ev);
                        }} title="일정 수정"><IconPencil/></button>
                        <button className={styles.deleteBtn} onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteEvent(ev);
                        }} disabled={deletingId === ev.id} title="일정 삭제">
                          {deletingId === ev.id ? "..." : <IconClose/>}
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
              <Divider />
              {microsoftTokens ? (
                <section>
                  <div className={styles.dayDetailHeader}>
                    <h3 className={styles.dayDetailTitle}>마감 예정 할일</h3>
                    <button className={styles.dayAddBtn} onClick={() => openTodoForm()}><IconPlus/> 추가</button>
                  </div>
                  {renderTodoGroups(dueTodoGroups, "마감일 있는 할일이 없습니다.")}
                </section>
              ) : (
                <section>
                  <div className={styles.dayDetailHeader}>
                    <h3 className={styles.dayDetailTitle}>마감 예정 할일</h3>
                  </div>
                  <UnavailableContent type="MICROSOFT" />
                </section>
              )}
            </div>
          </div>
        </div>

      {/* 드래그 고스트 */}
      {draggingEvent && (
        <div
          className={styles.dragGhost}
          style={{left: ghostPos.x + 14, top: ghostPos.y - 10}}
        >
          {draggingEvent.title}
        </div>
      )}

      {/* 할일 추가/수정 모달 */}
      {todoForm.open && (
        <div className={styles.modalOverlay} onClick={closeTodoForm}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{todoForm.mode === "create" ? "할일 추가" : "할일 수정"}</h2>
              <button className={styles.modalClose} onClick={closeTodoForm}><IconClose/></button>
            </div>
            <form onSubmit={handleTodoSubmit}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>제목</label>
                <div className={styles.todoTitleInputRow}>
                  <input
                    className={styles.formInput}
                    value={todoForm.title}
                    onChange={(e) => setTodoForm((f) => ({...f, title: e.target.value}))}
                    placeholder="할일 제목"
                    autoFocus
                  />
                  <button
                    type="button"
                    className={`${styles.todoModalIconBtn}${todoForm.importance === "high" ? ` ${styles.todoModalIconBtnActive}` : ""}`}
                    onClick={() => setTodoForm((f) => ({...f, importance: f.importance === "high" ? "normal" : "high"}))}
                    title={todoForm.importance === "high" ? "즐겨찾기 해제" : "즐겨찾기"}
                  >
                    <IconStar filled={todoForm.importance === "high"}/>
                  </button>
                </div>
              </div>
              {todoLists.length > 1 && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>목록</label>
                  <select
                    className={styles.formInput}
                    value={todoForm.listId}
                    onChange={(e) => setTodoForm((f) => ({...f, listId: e.target.value}))}
                  >
                    {todoLists.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>마감일</label>
                <div className={styles.todoDueInputRow}>
                  <input
                    className={styles.formInput}
                    type="date"
                    value={todoForm.dueDate}
                    onChange={(e) => setTodoForm((f) => ({...f, dueDate: e.target.value}))}
                  />
                  <button
                    type="button"
                    className={`${styles.todoModalIconBtn}${todoForm.repeatEnabled ? ` ${styles.todoModalIconBtnActive}` : ""}`}
                    onClick={() => setTodoForm((f) => ({...f, repeatEnabled: !f.repeatEnabled}))}
                    title={todoForm.repeatEnabled ? "반복 해제" : "반복"}
                  >
                    <IconRepeat/>
                  </button>
                </div>
              </div>
              {todoForm.repeatEnabled && (
                <div className={styles.repeatPanel}>
                  <label className={styles.formLabel}>반복</label>
                  <div className={styles.repeatControls}>
                    <select
                      className={styles.formInput}
                      value={todoForm.repeatType}
                      onChange={(e) => setTodoForm((f) => ({...f, repeatType: e.target.value as TodoFormState["repeatType"]}))}
                    >
                      <option value="daily">매일</option>
                      <option value="weekly">매주</option>
                      <option value="absoluteMonthly">매월</option>
                      <option value="absoluteYearly">매년</option>
                    </select>
                    <div className={styles.repeatIntervalControl}>
                      <input
                        className={styles.formInput}
                        type="number"
                        min={1}
                        max={99}
                        value={todoForm.repeatInterval}
                        onChange={(e) => setTodoForm((f) => ({...f, repeatInterval: Math.max(1, Number(e.target.value) || 1)}))}
                      />
                      <span>{recurrenceLabel(todoForm.repeatType)}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className={styles.formGroup}>
                <div className={styles.checklistHeader}>
                  <label className={styles.formLabel}>체크리스트</label>
                  <button
                    type="button"
                    className={styles.checklistAddBtn}
                    onClick={() => setTodoForm((f) => ({
                      ...f,
                      checklistItems: [...f.checklistItems, {displayName: "", isChecked: false}],
                    }))}
                  >
                    <IconPlus/> 항목 추가
                  </button>
                </div>
                {todoForm.checklistItems.length > 0 && (
                  <ul className={styles.checklistEditor}>
                    {todoForm.checklistItems.map((item, index) => (
                      <li key={item.id ?? index} className={styles.checklistEditorItem}>
                        <button
                          type="button"
                          className={`${styles.todoChecklistBtn}${item.isChecked ? ` ${styles.todoChecklistChecked}` : ""}`}
                          onClick={() => setTodoForm((f) => ({
                            ...f,
                            checklistItems: f.checklistItems.map((current, i) =>
                              i === index ? {...current, isChecked: !current.isChecked} : current
                            ),
                          }))}
                          title={item.isChecked ? "완료 취소" : "완료"}
                        />
                        <input
                          className={styles.checklistEditorInput}
                          value={item.displayName}
                          onChange={(e) => setTodoForm((f) => ({
                            ...f,
                            checklistItems: f.checklistItems.map((current, i) =>
                              i === index ? {...current, displayName: e.target.value} : current
                            ),
                          }))}
                          placeholder="체크리스트 항목"
                        />
                        <button
                          type="button"
                          className={styles.checklistRemoveBtn}
                          onClick={() => setTodoForm((f) => ({
                            ...f,
                            checklistItems: f.checklistItems.filter((_, i) => i !== index),
                          }))}
                          title="항목 삭제"
                        >
                          <IconClose/>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>메모</label>
                <textarea
                  className={`${styles.formInput} ${styles.formTextarea}`}
                  value={todoForm.memo}
                  onChange={(e) => setTodoForm((f) => ({...f, memo: e.target.value}))}
                  placeholder="메모 (선택)"
                  rows={3}
                />
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={closeTodoForm}>취소</button>
                <button type="submit" className={styles.submitBtn}
                        disabled={!todoForm.title.trim() || todoSubmitting}>
                  {todoSubmitting ? "저장 중..." : todoForm.mode === "create" ? "추가" : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 일정 상세 모달 */}
      {detailEvent && (
        <div className={styles.modalOverlay} onClick={() => setDetailEvent(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span
                className={styles.detailDot}
                style={detailEvent.calendarColor ? {background: detailEvent.calendarColor} : undefined}
              />
              <h2 className={styles.modalTitle}>{detailEvent.title}</h2>
              <button className={styles.modalClose} onClick={() => setDetailEvent(null)}><IconClose/></button>
            </div>
            <div className={styles.detailBody}>
              <p className={styles.detailRow}>
                🕐 {detailEvent.isAllDay
                ? new Date(detailEvent.startTime + "T00:00:00").toLocaleDateString("ko-KR", {
                month: "long",
                day: "numeric",
                weekday: "short"
              }) + " (종일)"
                : (() => {
                  const s = new Date(detailEvent.startTime);
                  const e2 = new Date(detailEvent.endTime);
                  return `${s.toLocaleDateString("ko-KR", {
                    month: "long",
                    day: "numeric",
                    weekday: "short"
                  })} ${s.toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit"
                  })} – ${e2.toLocaleTimeString("ko-KR", {hour: "2-digit", minute: "2-digit"})}`;
                })()
              }
              </p>
              {detailEvent.location && (
                <p className={styles.detailRow}>📍 {detailEvent.location}</p>
              )}
              <p className={styles.detailRow}>
                🗂 {calendars.find((c) => c.id === detailEvent.calendarId)?.summary ?? "기본 캘린더"}
              </p>
              {detailEvent.description && (
                <p className={styles.detailDesc}>{detailEvent.description}</p>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button
                className={styles.dangerOutlineBtn}
                onClick={() => {
                  setDetailEvent(null);
                  handleDeleteEvent(detailEvent);
                }}
                disabled={deletingId === detailEvent.id}
              >
                {deletingId === detailEvent.id ? "삭제 중..." : "삭제"}
              </button>
              <button
                className={styles.submitBtn}
                onClick={() => {
                  setDetailEvent(null);
                  openEditForm(detailEvent);
                }}
              >
                수정
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일정 추가/수정 모달 */}
      {eventForm.open && (
        <div className={styles.modalOverlay} onClick={closeEventForm}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{eventForm.editEventId ? "일정 수정" : "새 일정"}</h2>
              <button className={styles.modalClose} onClick={closeEventForm}><IconClose/></button>
            </div>
            <form onSubmit={handleEventFormSubmit}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>제목</label>
                <input
                  className={styles.formInput}
                  value={eventForm.title}
                  onChange={(e) => setEventForm((f) => ({...f, title: e.target.value}))}
                  placeholder="일정 제목"
                  autoFocus
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>날짜</label>
                  <input
                    className={styles.formInput}
                    type="date"
                    value={eventForm.date}
                    onChange={(e) => setEventForm((f) => ({...f, date: e.target.value}))}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>캘린더</label>
                  <select
                    className={styles.formInput}
                    value={eventForm.calendarId}
                    onChange={(e) => setEventForm((f) => ({...f, calendarId: e.target.value}))}
                  >
                    {calendars.length > 0
                      ? calendars.map((cal) => (
                        <option key={cal.id} value={cal.id}>{cal.summary}</option>
                      ))
                      : <option value="primary">기본 캘린더</option>
                    }
                  </select>
                </div>
              </div>

              <div className={styles.allDayRow}>
                <input
                  type="checkbox"
                  id="formIsAllDay"
                  checked={eventForm.isAllDay}
                  onChange={(e) => setEventForm((f) => ({...f, isAllDay: e.target.checked}))}
                />
                <label htmlFor="formIsAllDay" className={styles.allDayLabel}>종일</label>
              </div>

              {!eventForm.isAllDay && (
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>시작</label>
                    <input
                      className={styles.formInput}
                      type="time"
                      value={eventForm.startTime}
                      onChange={(e) => setEventForm((f) => ({...f, startTime: e.target.value}))}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>종료</label>
                    <input
                      className={styles.formInput}
                      type="time"
                      value={eventForm.endTime}
                      onChange={(e) => setEventForm((f) => ({...f, endTime: e.target.value}))}
                    />
                  </div>
                </div>
              )}

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>장소 (선택)</label>
                <input
                  className={styles.formInput}
                  value={eventForm.location}
                  onChange={(e) => setEventForm((f) => ({...f, location: e.target.value}))}
                  placeholder="장소"
                />
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={closeEventForm}>취소</button>
                <button type="submit" className={styles.submitBtn}
                        disabled={!eventForm.title.trim() || !eventForm.date || eventForm.submitting}>
                  {eventForm.submitting ? "저장 중..." : eventForm.editEventId ? "수정 저장" : "일정 추가"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
