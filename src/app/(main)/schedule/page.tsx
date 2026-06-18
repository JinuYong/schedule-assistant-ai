"use client";

import {useEffect, useState, useCallback, useMemo, useRef} from "react";
import {useAuthStore} from "@/store/auth";
import {useEventsStore, CalendarEvent} from "@/store/events";
import {useTodosStore, TodoItem} from "@/store/todos";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  getCalendarList,
  clearCalendarListCache,
  CalendarListItem
} from "@/lib/google-calendar";
import {listen} from "@tauri-apps/api/event";
import {formatMonthYear, formatDateLabel} from "@/lib/date-utils";
import {isTauri} from "@/lib/tauri-store";
import {showToast} from "@/store/toast";
import Divider from "@/components/divider";
import {IconChevronLeft, IconChevronRight, IconRefresh, IconPlus} from "@/components/icons";
import styles from "./page.module.css";
import UnavailableContent from '@/components/unavailable-content'
import {
  buildCells, daysInMonth, isoDate, getEventDateKey, buildMovedTimeFields,
  eventShortLabel, buildTodoTaskFromForm, todoEditFormState, EMPTY_FORM, EMPTY_TODO_FORM,
  type EventForm, type TodoFormState,
} from "./calendar-utils";
import {useTodayInfo} from "./hooks/use-today-info";
import {useSidePanelWidth} from "./hooks/use-side-panel-width";
import {useEventDrag} from "./hooks/use-event-drag";
import {useTodoActions} from "@/hooks/use-todo-actions";
import {useScheduleCommand} from "@/hooks/use-schedule-command";
import CalendarGrid from "./components/calendar-grid";
import EventList from "./components/event-list";
import TodoGroups from "./components/todo-groups";
import EventFormModal from "./components/event-form-modal";
import EventDetailModal from "./components/event-detail-modal";
import TodoFormModal from "./components/todo-form-modal";

export default function SchedulePage() {
  // 필드별 셀렉터 구독 — 미사용 스토어 필드(todos.lastFetchedAt 등) 변경 시 리렌더 방지
  const googleTokens = useAuthStore((s) => s.googleTokens);
  const microsoftTokens = useAuthStore((s) => s.microsoftTokens);
  const refreshGoogle = useAuthStore((s) => s.refreshGoogle);
  const refreshMicrosoft = useAuthStore((s) => s.refreshMicrosoft);

  const events = useEventsStore((s) => s.events);
  const isLoading = useEventsStore((s) => s.isLoading);
  const error = useEventsStore((s) => s.error);
  const fetchEvents = useEventsStore((s) => s.fetchEvents);
  const prefetchEvents = useEventsStore((s) => s.prefetchEvents);
  const invalidateCache = useEventsStore((s) => s.invalidateCache);

  const todos = useTodosStore((s) => s.todos);
  const todosLoading = useTodosStore((s) => s.isLoading);
  const todosError = useTodosStore((s) => s.error);
  const fetchTodos = useTodosStore((s) => s.fetchTodos);
  const createTodo = useTodosStore((s) => s.createTodo);
  const updateTodo = useTodosStore((s) => s.updateTodo);

  const {todayInfo, refreshTodayInfo} = useTodayInfo();
  const [currentYear, setCurrentYear] = useState(todayInfo.year);
  const [currentMonth, setCurrentMonth] = useState(todayInfo.month);
  const [selectedDate, setSelectedDate] = useState<string>(todayInfo.date);
  const [calendars, setCalendars] = useState<CalendarListItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<EventForm>(EMPTY_FORM);
  const [todoForm, setTodoForm] = useState<TodoFormState>(EMPTY_TODO_FORM);
  const [todoSubmitting, setTodoSubmitting] = useState(false);
  const [expandedTodos, setExpandedTodos] = useState<Set<string>>(new Set());
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

  const goToToday = useCallback(() => {
    const nextToday = refreshTodayInfo();
    setCurrentYear(nextToday.year);
    setCurrentMonth(nextToday.month);
    setSelectedDate(nextToday.date);
  }, [refreshTodayInfo]);

  // 우측 패널 너비 (드래그 리사이즈)
  const {sidePanelWidth, handleSidePointerDown, handleSidePointerMove, handleSidePointerUp} = useSidePanelWidth();

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
  }, [googleTokens?.access_token]); // eslint-disable-line react-hooks/exhaustive-deps -- 토큰 문자열에만 의존(객체 재생성 시 재실행 방지), 나머지 누락 deps는 안정적 액션

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
  }, [googleTokens?.access_token, currentYear, currentMonth]); // eslint-disable-line react-hooks/exhaustive-deps -- 토큰 문자열에만 의존(객체 재생성 시 재실행 방지), 나머지 누락 deps는 안정적 액션

  // Microsoft Todo 로드 — refreshMicrosoft() 거치지 않고 저장된 토큰 직접 사용
  // (refresh 중 Rust invoke 실패 시 fetchTodos가 아예 호출되지 않는 문제 방지)
  useEffect(() => {
    if (!microsoftTokens?.access_token) return;
    fetchTodos(microsoftTokens.access_token);
  }, [microsoftTokens?.access_token]); // eslint-disable-line react-hooks/exhaustive-deps -- 토큰 문자열에만 의존(객체 재생성 시 재실행 방지), 나머지 누락 deps는 안정적 액션

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
  }, [googleTokens?.access_token]); // eslint-disable-line react-hooks/exhaustive-deps -- 토큰 문자열에만 의존(객체 재생성 시 재실행 방지), 나머지 누락 deps는 안정적 액션

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

  // 칩 클릭 핸들러 — CalendarGrid memo가 깨지지 않도록 안정적 참조 유지
  const handleEventChipClick = useCallback((ev: CalendarEvent, date: string) => {
    setSelectedDate(date);
    setDetailEvent(ev);
  }, []);

  const handleRefreshAll = useCallback(async () => {
    clearCalendarListCache();
    const [g, m] = await Promise.all([refreshGoogle(), refreshMicrosoft()]);
    const p: Promise<void>[] = [];
    if (g?.access_token) p.push(fetchEvents(g.access_token, gridRange.timeMin, gridRange.timeMax));
    if (m?.access_token) p.push(fetchTodos(m.access_token));
    await Promise.all(p);
  }, [refreshGoogle, refreshMicrosoft, fetchEvents, fetchTodos, gridRange]);

  const {
    input: quickInput,
    setInput: setQuickInput,
    status: quickStatus,
    matches: quickMatches,
    activeIndex: quickActiveIndex,
    setActiveIndex: setQuickActiveIndex,
    showDropdown: showQuickDropdown,
    loading: quickDateLoading,
    lockedTarget: quickLockedTarget,
    lockTarget: lockQuickTarget,
    clearLock: clearQuickLock,
    handleKeyDown: onQuickKeyDown,
    submit: submitQuickCommand,
  } = useScheduleCommand({
    events,
    calendars,
    primaryCalendarId,
    getToken: useCallback(async () => (await refreshGoogle())?.access_token ?? null, [refreshGoogle]),
    onMutated: useCallback(async () => {
      invalidateCache();
      const tokens = await refreshGoogle();
      if (tokens?.access_token) {
        await fetchEvents(tokens.access_token, gridRangeRef.current.timeMin, gridRangeRef.current.timeMax);
      }
    }, [refreshGoogle, invalidateCache, fetchEvents]),
    onError: showToast,
  });

  const handleQuickAdd = useCallback((e: { preventDefault(): void }) => {
    e.preventDefault();
    void submitQuickCommand();
  }, [submitQuickCommand]);

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

  // 드래그-이동 + 클릭(상세) 구분 (document 레벨 마우스 이벤트)
  const {draggingEvent, dragOverDate, ghostPos, startDrag} = useEventDrag({
    onDrop: handleDropEvent,
    onClick: setDetailEvent,
  });

  // Microsoft Todo CRUD — refreshMicrosoft()로 토큰 확보 후 스토어 액션 호출
  const resolveMicrosoftToken = useCallback(
    async () => (await refreshMicrosoft())?.access_token ?? null,
    [refreshMicrosoft]
  );
  const todoActions = useTodoActions(resolveMicrosoftToken);

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
    setTodoForm(todoEditFormState(todo));
  }, []);

  const closeTodoForm = useCallback(() => setTodoForm(EMPTY_TODO_FORM), []);

  const handleTodoSubmit = useCallback(async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!todoForm.title.trim() || !todoForm.listId || !microsoftTokens?.access_token) return;
    setTodoSubmitting(true);
    try {
      const task = buildTodoTaskFromForm(todoForm);
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

  if (!googleTokens) {
    return (
      <div className={styles.container}>
        <UnavailableContent type="GOOGLE" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 자연어 입력: 대상 미지정 + Enter → 생성 · 후보 지정 후 명령 → 수정/삭제 */}
      <form className={styles.quickAddForm} onSubmit={handleQuickAdd}>
        <div className={styles.quickAddInputWrap}>
          {quickLockedTarget && (
            <span className={styles.lockChip} title={quickLockedTarget.title}>
              <span className={styles.lockChipLabel}>{quickLockedTarget.title}</span>
              <button type="button" className={styles.lockChipClear} onClick={clearQuickLock} aria-label="대상 해제">✕</button>
            </span>
          )}
          <input
            className={styles.quickAddInput}
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            onKeyDown={onQuickKeyDown}
            placeholder={quickLockedTarget
              ? "수정/삭제 명령 입력 (예: 삭제, 오후 7시로 변경)"
              : "자연어로 일정 추가 (예: 내일 오후 3시 팀 미팅 회사 캘린더에)"}
            disabled={quickStatus === "loading"}
            autoComplete="off"
          />
          {showQuickDropdown && (
            <ul className={styles.quickDropdown}>
              {quickDateLoading && quickMatches.length === 0 ? (
                [0, 1].map((i) => (
                  <li key={`sk-${i}`} className={styles.skeletonRow}>
                    <span className={`${styles.skeletonBar} ${styles.skeletonTitle}`}/>
                    <span className={`${styles.skeletonBar} ${styles.skeletonMeta}`}/>
                  </li>
                ))
              ) : (
                <li className={styles.quickDropdownHint}>
                  ↑↓로 대상 지정 후 명령 입력 · 지정 없이 Enter는 새 일정
                </li>
              )}
              {quickMatches.map((ev, i) => (
                <li
                  key={ev.id}
                  className={`${styles.quickDropdownItem} ${i === quickActiveIndex ? styles.quickDropdownItemActive : ""}`}
                  onMouseEnter={() => setQuickActiveIndex(i)}
                  onMouseDown={(e) => { e.preventDefault(); lockQuickTarget(ev); }}
                  style={ev.calendarColor ? {borderLeftColor: ev.calendarColor} : undefined}
                >
                  <span className={styles.quickDropdownTitle}>{ev.title}</span>
                  <span className={styles.quickDropdownMeta}>{eventShortLabel(ev)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className={styles.quickAddBtn} type="submit"
                disabled={(!quickInput.trim() && !quickLockedTarget) || quickStatus === "loading"}>
          {quickStatus === "loading" ? "분석 중..." : quickStatus === "done" ? "완료 ✓" : quickStatus === "error" ? "오류 ✗"
            : quickLockedTarget ? "실행" : "추가"}
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

            <CalendarGrid
              cells={cells}
              todayDate={todayInfo.date}
              selectedDate={selectedDate}
              eventsByDate={eventsByDate}
              draggingEvent={draggingEvent}
              dragOverDate={dragOverDate}
              prevMonth={prevMonth}
              nextMonth={nextMonth}
              onSelectDate={setSelectedDate}
              onAddEvent={openEventForm}
              onEventChipClick={handleEventChipClick}
              onEventMouseDown={startDrag}
            />

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
                <EventList
                  isLoading={isLoading}
                  events={selectedEvents}
                  deletingId={deletingId}
                  onEventClick={setDetailEvent}
                  onEdit={openEditForm}
                  onDelete={handleDeleteEvent}
                />
              </section>
              <Divider />
              {microsoftTokens ? (
                <section>
                  <div className={styles.dayDetailHeader}>
                    <h3 className={styles.dayDetailTitle}>마감 예정 할일</h3>
                    <button className={styles.dayAddBtn} onClick={() => openTodoForm()}><IconPlus/> 추가</button>
                  </div>
                  <TodoGroups
                    groups={dueTodoGroups}
                    emptyMessage="마감일 있는 할일이 없습니다."
                    todosError={todosError}
                    todosLoading={todosLoading}
                    expandedTodos={expandedTodos}
                    onToggleExpand={toggleTodoExpand}
                    onComplete={todoActions.complete}
                    onEditTodo={openTodoEditForm}
                    onDeleteTodo={todoActions.remove}
                    onToggleImportance={todoActions.toggleImportance}
                    onToggleChecklist={todoActions.toggleChecklist}
                  />
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
        <TodoFormModal
          form={todoForm}
          setForm={setTodoForm}
          todoLists={todoLists}
          submitting={todoSubmitting}
          onClose={closeTodoForm}
          onSubmit={handleTodoSubmit}
        />
      )}

      {/* 일정 상세 모달 */}
      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          calendars={calendars}
          deletingId={deletingId}
          onClose={() => setDetailEvent(null)}
          onDelete={(ev) => { setDetailEvent(null); handleDeleteEvent(ev); }}
          onEdit={(ev) => { setDetailEvent(null); openEditForm(ev); }}
        />
      )}

      {/* 일정 추가/수정 모달 */}
      {eventForm.open && (
        <EventFormModal
          form={eventForm}
          setForm={setEventForm}
          calendars={calendars}
          onClose={closeEventForm}
          onSubmit={handleEventFormSubmit}
        />
      )}
    </div>
  );
}
