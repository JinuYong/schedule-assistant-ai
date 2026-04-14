"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuthStore } from "@/store/auth";
import { useEventsStore, CalendarEvent } from "@/store/events";
import { useTodosStore, TodoItem } from "@/store/todos";
import { parseScheduleText } from "@/lib/claude";
import { createEvent, updateEvent, deleteEvent, getCalendarList, CalendarListItem } from "@/lib/google-calendar";
import { showToast } from "@/store/toast";
import styles from "./page.module.css";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

function firstWeekday(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function formatMonthYear(y: number, m: number): string {
  return new Date(y, m, 1).toLocaleDateString("ko-KR", { year: "numeric", month: "long" });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}
function formatDateLabel(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("ko-KR", {
    month: "long", day: "numeric", weekday: "short",
  });
}
function formatDue(dateTime: string) {
  const d = new Date(dateTime);
  const today = new Date();
  const isPast = d < today && d.toDateString() !== today.toDateString();
  const isToday = d.toDateString() === today.toDateString();
  const label = isToday ? "오늘" : d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  return { label, isPast };
}
function getEventDateKey(ev: CalendarEvent): string {
  return ev.startTime.split("T")[0] ?? ev.startTime.slice(0, 10);
}

interface CalCell { date: string; day: number; inMonth: boolean; isSunday: boolean; }

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
    cells.push({ date: dt, day: d, inMonth: false, isSunday: new Date(dt + "T00:00:00").getDay() === 0 });
  }
  for (let d = 1; d <= dim; d++) {
    const dt = isoDate(year, month, d);
    cells.push({ date: dt, day: d, inMonth: true, isSunday: new Date(dt + "T00:00:00").getDay() === 0 });
  }
  const nextY = month === 11 ? year + 1 : year;
  const nextM = month === 11 ? 0 : month + 1;
  let nextD = 1;
  while (cells.length < 42) {
    const dt = isoDate(nextY, nextM, nextD);
    cells.push({ date: dt, day: nextD, inMonth: false, isSunday: new Date(dt + "T00:00:00").getDay() === 0 });
    nextD++;
  }
  return cells;
}

/** 이벤트를 다른 날짜로 이동할 때 시간 보존 */
function buildMovedTimeFields(ev: CalendarEvent, newDate: string) {
  if (ev.isAllDay) {
    return { start: { date: newDate }, end: { date: newDate } };
  }
  const origStart = new Date(ev.startTime);
  const durationMs = new Date(ev.endTime).getTime() - origStart.getTime();
  const [y, m, d] = newDate.split("-").map(Number);
  const newStart = new Date(y, m - 1, d, origStart.getHours(), origStart.getMinutes(), origStart.getSeconds());
  const newEnd   = new Date(newStart.getTime() + durationMs);
  return {
    start: { dateTime: newStart.toISOString(), timeZone: "Asia/Seoul" },
    end:   { dateTime: newEnd.toISOString(),   timeZone: "Asia/Seoul" },
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

export default function SchedulePage() {
  const { googleTokens, microsoftTokens, refreshGoogle, refreshMicrosoft } = useAuthStore();
  const { events, isLoading, error, fetchEvents, prefetchEvents, invalidateCache } = useEventsStore();
  const { todos, isLoading: todosLoading, error: todosError, fetchTodos, completeTodo } = useTodosStore();

  const today = new Date();
  const todayStr = isoDate(today.getFullYear(), today.getMonth(), today.getDate());

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [calendars, setCalendars] = useState<CalendarListItem[]>([]);
  const [quickInput, setQuickInput] = useState("");
  const [quickStatus, setQuickStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<EventForm>(EMPTY_FORM);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [draggingEvent, setDraggingEvent] = useState<CalendarEvent | null>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef<CalendarEvent | null>(null);
  const dropHandlerRef = useRef<(ev: CalendarEvent, targetDate: string) => void>(() => {});

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
      prefetchEvents(tokens.access_token, new Date(prevCells[0].date + "T00:00:00").toISOString(), new Date(prevCells[prevCells.length - 1].date + "T23:59:59").toISOString());
      prefetchEvents(tokens.access_token, new Date(nextCells[0].date + "T00:00:00").toISOString(), new Date(nextCells[nextCells.length - 1].date + "T23:59:59").toISOString());
    })();
  }, [googleTokens?.access_token, currentYear, currentMonth]); // eslint-disable-line

  // Microsoft Todo 로드
  useEffect(() => {
    if (!microsoftTokens) return;
    (async () => {
      const tokens = await refreshMicrosoft();
      if (tokens?.access_token) fetchTodos(tokens.access_token);
    })();
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

  const prevMonth = useCallback(() => {
    if (currentMonth === 0) { setCurrentYear((y) => y - 1); setCurrentMonth(11); }
    else setCurrentMonth((m) => m - 1);
  }, [currentMonth]);

  const nextMonth = useCallback(() => {
    if (currentMonth === 11) { setCurrentYear((y) => y + 1); setCurrentMonth(0); }
    else setCurrentMonth((m) => m + 1);
  }, [currentMonth]);

  const openEventForm = useCallback((date: string) => {
    setEventForm({ ...EMPTY_FORM, open: true, date, calendarId: primaryCalendarId });
  }, [primaryCalendarId]);

  const openEditForm = useCallback((ev: CalendarEvent) => {
    const dateStr = ev.startTime.split("T")[0];
    const startT = ev.isAllDay ? "09:00" : new Date(ev.startTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
    const endT   = ev.isAllDay ? "10:00" : new Date(ev.endTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
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
    const [g, m] = await Promise.all([refreshGoogle(), refreshMicrosoft()]);
    const p: Promise<void>[] = [];
    if (g?.access_token) p.push(fetchEvents(g.access_token, gridRange.timeMin, gridRange.timeMax));
    if (m?.access_token) p.push(fetchTodos(m.access_token));
    await Promise.all(p);
  }, [refreshGoogle, refreshMicrosoft, fetchEvents, fetchTodos, gridRange]);

  const handleQuickAdd = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const text = quickInput.trim();
    if (!text || quickStatus === "loading") return;
    setQuickStatus("loading");
    try {
      const tokens = await refreshGoogle();
      if (!tokens?.access_token) throw new Error("Google 계정 연결이 필요합니다.");
      const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
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
          ? { start: { date: parsed.startTime.split("T")[0] }, end: { date: parsed.endTime.split("T")[0] } }
          : { start: { dateTime: parsed.startTime, timeZone: "Asia/Seoul" }, end: { dateTime: parsed.endTime, timeZone: "Asia/Seoul" } }),
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

  const handleEventFormSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.title.trim() || eventForm.submitting) return;
    setEventForm((f) => ({ ...f, submitting: true }));
    try {
      const tokens = await refreshGoogle();
      if (!tokens?.access_token) throw new Error("Google 계정 연결이 필요합니다.");
      const timeFields = eventForm.isAllDay
        ? { start: { date: eventForm.date }, end: { date: eventForm.date } }
        : {
            start: { dateTime: `${eventForm.date}T${eventForm.startTime}:00`, timeZone: "Asia/Seoul" },
            end:   { dateTime: `${eventForm.date}T${eventForm.endTime}:00`,   timeZone: "Asia/Seoul" },
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
      setEventForm((f) => ({ ...f, submitting: false }));
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

  // dropHandlerRef를 항상 최신 handleDropEvent로 유지
  dropHandlerRef.current = handleDropEvent;

  // 드래그 중 document 레벨 마우스 이벤트 (HTML5 DnD 대신 마우스 이벤트 사용)
  useEffect(() => {
    if (!draggingEvent) return;

    const onMove = (e: MouseEvent) => {
      setGhostPos({ x: e.clientX, y: e.clientY });
      const el = document.elementFromPoint(e.clientX, e.clientY);
      setDragOverDate(el?.closest<HTMLElement>("[data-date]")?.dataset.date ?? null);
    };

    const onUp = (e: MouseEvent) => {
      const ev = dragStateRef.current;
      dragStateRef.current = null;
      setDraggingEvent(null);
      setDragOverDate(null);
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

  const hasAnyAccount = !!googleTokens || !!microsoftTokens;

  if (!hasAnyAccount) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <p>Google Calendar 또는 Microsoft Todo를 연동하면 일정이 표시됩니다.</p>
          <a href="/settings/" className={styles.linkBtn}>설정으로 이동</a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 자연어 빠른 추가 */}
      {googleTokens && (
        <form className={styles.quickAddForm} onSubmit={handleQuickAdd}>
          <input
            className={styles.quickAddInput}
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="자연어로 일정 추가 (예: 내일 오후 3시 팀 미팅 해진 캘린더에)"
            disabled={quickStatus === "loading"}
          />
          <button className={styles.quickAddBtn} type="submit" disabled={!quickInput.trim() || quickStatus === "loading"}>
            {quickStatus === "loading" ? "분석 중..." : quickStatus === "done" ? "완료 ✓" : quickStatus === "error" ? "오류 ✗" : "추가"}
          </button>
          <button type="button" className={styles.refreshBtn} onClick={handleRefreshAll} disabled={isLoading || todosLoading} title="새로고침">↻</button>
        </form>
      )}

      {/* 달력 */}
      {googleTokens && (
        <>
          <div className={styles.calendarHeader}>
            <button className={styles.navBtn} onClick={prevMonth}>‹</button>
            <h2 className={styles.monthTitle}>{formatMonthYear(currentYear, currentMonth)}</h2>
            <button className={styles.navBtn} onClick={nextMonth}>›</button>
            {isLoading && <span className={styles.loadingDot} />}
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.calendar}>
            <div className={styles.weekdays}>
              {WEEKDAYS.map((wd, i) => (
                <div key={wd} className={`${styles.weekdayHeader}${i === 6 ? ` ${styles.sundayLabel}` : ""}`}>{wd}</div>
              ))}
            </div>
            <div className={styles.dayCells}>
              {cells.map(({ date, day, inMonth, isSunday }) => {
                const isToday = date === todayStr;
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
                    onClick={() => { if (!draggingEvent) setSelectedDate(date); }}
                  >
                    <span className={styles.dayNumber}>{day}</span>
                    {inMonth && (
                      <button
                        className={styles.cellAddBtn}
                        onClick={(e) => { e.stopPropagation(); openEventForm(date); }}
                        title="일정 추가"
                      >
                        +
                      </button>
                    )}
                    {shown.map((ev) => (
                      <span
                        key={ev.id}
                        className={`${styles.eventChip}${draggingEvent?.id === ev.id ? ` ${styles.draggingChip}` : ""}`}
                        style={ev.calendarColor ? { background: ev.calendarColor, color: "#fff" } : undefined}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dragStateRef.current = ev;
                          setDraggingEvent(ev);
                          setGhostPos({ x: e.clientX, y: e.clientY });
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

          {/* 선택된 날의 일정 */}
          <section className={styles.dayDetail}>
            <div className={styles.dayDetailHeader}>
              <h3 className={styles.dayDetailTitle}>{formatDateLabel(selectedDate)}</h3>
              <button className={styles.dayAddBtn} onClick={() => openEventForm(selectedDate)}>+ 추가</button>
            </div>
            {!isLoading && selectedEvents.length === 0 && <p className={styles.empty}>일정이 없습니다.</p>}
            <ul className={styles.eventList}>
              {selectedEvents.map((ev) => (
                <li
                  key={ev.id}
                  className={styles.eventItem}
                  style={ev.calendarColor ? { borderLeftColor: ev.calendarColor } : undefined}
                >
                  <span className={styles.eventTime} style={ev.calendarColor ? { color: ev.calendarColor } : undefined}>
                    {ev.isAllDay ? "종일" : formatTime(ev.startTime)}
                  </span>
                  <div className={styles.eventBody}>
                    <p className={styles.eventTitle}>{ev.title}</p>
                    {ev.location && <p className={styles.eventMeta}>📍 {ev.location}</p>}
                  </div>
                  <button className={styles.editBtn} onClick={() => openEditForm(ev)} title="일정 수정">✎</button>
                  <button className={styles.deleteBtn} onClick={() => handleDeleteEvent(ev)} disabled={deletingId === ev.id} title="일정 삭제">
                    {deletingId === ev.id ? "..." : "✕"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/* Microsoft Todo */}
      {microsoftTokens && (
        <section className={styles.todoSection}>
          <h2 className={styles.todoTitle}>할일</h2>
          {todosError && <p className={styles.error}>{todosError}</p>}
          {todosLoading && <p className={styles.empty}>불러오는 중...</p>}
          {!todosLoading && todos.length === 0 && <p className={styles.empty}>미완료 할일이 없습니다.</p>}
          <ul className={styles.todoList}>
            {todos.map((todo) => {
              const due = todo.dueDateTime ? formatDue(todo.dueDateTime.dateTime) : null;
              return (
                <li key={todo.id} className={styles.todoItem}>
                  <button className={styles.todoCheck} onClick={() => handleCompleteTodo(todo)} title="완료 처리" />
                  <div className={styles.todoBody}>
                    <p className={styles.todoText}>{todo.title}</p>
                    <div className={styles.todoMeta}>
                      <span className={styles.todoListName}>{todo.listName}</span>
                      {due && (
                        <span className={`${styles.todoDue}${due.isPast ? ` ${styles.todoDueOverdue}` : ""}`}>{due.label}</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 드래그 고스트 */}
      {draggingEvent && (
        <div
          className={styles.dragGhost}
          style={{ left: ghostPos.x + 14, top: ghostPos.y - 10 }}
        >
          {draggingEvent.title}
        </div>
      )}

      {/* 일정 추가 모달 */}
      {eventForm.open && (
        <div className={styles.modalOverlay} onClick={closeEventForm}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{eventForm.editEventId ? "일정 수정" : "새 일정"}</h2>
              <button className={styles.modalClose} onClick={closeEventForm}>✕</button>
            </div>
            <form onSubmit={handleEventFormSubmit}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>제목</label>
                <input
                  className={styles.formInput}
                  value={eventForm.title}
                  onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
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
                    onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>캘린더</label>
                  <select
                    className={styles.formInput}
                    value={eventForm.calendarId}
                    onChange={(e) => setEventForm((f) => ({ ...f, calendarId: e.target.value }))}
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
                  onChange={(e) => setEventForm((f) => ({ ...f, isAllDay: e.target.checked }))}
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
                      onChange={(e) => setEventForm((f) => ({ ...f, startTime: e.target.value }))}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>종료</label>
                    <input
                      className={styles.formInput}
                      type="time"
                      value={eventForm.endTime}
                      onChange={(e) => setEventForm((f) => ({ ...f, endTime: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>장소 (선택)</label>
                <input
                  className={styles.formInput}
                  value={eventForm.location}
                  onChange={(e) => setEventForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="장소"
                />
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={closeEventForm}>취소</button>
                <button type="submit" className={styles.submitBtn} disabled={!eventForm.title.trim() || !eventForm.date || eventForm.submitting}>
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
