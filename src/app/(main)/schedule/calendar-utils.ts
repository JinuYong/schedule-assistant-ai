import { CalendarEvent } from "@/store/events";
import { ChecklistDraftItem, TodoItem } from "@/store/todos";
import { TodoTask, TodoTaskUpdates } from "@/lib/microsoft-todo";
import { CalendarListItem } from "@/lib/google-calendar";
import { graphDateTimeToMs } from "@/lib/date-utils";

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

/** 자동완성 후보의 날짜·시간 짧은 라벨 (예: 6/17 종일, 6/17 15:00) */
export function eventShortLabel(ev: CalendarEvent): string {
  const d = new Date(ev.startTime);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  if (ev.isAllDay) return `${md} 종일`;
  const t = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${md} ${t}`;
}

/**
 * 입력에서 날짜 표현을 추출해 YYYY-MM-DD로 반환(AI 호출 없음). 없으면 null.
 * 지원: 오늘/내일/모레/어제, "M월 D일", "M/D", "N일"(지난 날짜는 다음 달로).
 */
export function parseDateHint(query: string, now = new Date()): string | null {
  const q = query.trim();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rel = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
  };

  if (/오늘/.test(q)) return rel(0);
  if (/(내일|낼)/.test(q)) return rel(1);
  if (/모레/.test(q)) return rel(2);
  if (/어제/.test(q)) return rel(-1);

  // "M월 D일" 또는 "M/D"·"M-D"·"M.D" — 지난 날짜면 내년 (다가오는 날짜 우선)
  let m = q.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (!m) m = q.match(/(?:^|\s)(\d{1,2})[/\-.](\d{1,2})(?:$|\s)/);
  if (m) {
    const mo = Number(m[1]);
    const da = Number(m[2]);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      let y = now.getFullYear();
      if (new Date(y, mo - 1, da) < today) y += 1;
      const d = new Date(y, mo - 1, da);
      return d.getMonth() === mo - 1 ? isoDate(y, mo - 1, da) : null; // 무효 날짜 제외
    }
  }

  // "N일" — 이번 달 기준, 지난 날짜면 다음 달 (다가오는 날짜 우선)
  m = q.match(/(\d{1,2})\s*일/);
  if (m) {
    const da = Number(m[1]);
    if (da >= 1 && da <= 31) {
      let y = now.getFullYear();
      let mo = now.getMonth(); // 0-based
      if (da < now.getDate()) {
        mo += 1;
        if (mo > 11) { mo = 0; y += 1; }
      }
      // 해당 월에 그 날짜가 없으면(예: 6월 31일) 다음 달로
      if (new Date(y, mo, da).getDate() !== da) {
        mo += 1;
        if (mo > 11) { mo = 0; y += 1; }
        if (new Date(y, mo, da).getDate() !== da) return null;
      }
      return isoDate(y, mo, da);
    }
  }

  return null;
}

/**
 * 입력 텍스트로 기존 일정을 자동완성 후보로 매칭(AI 호출 없음).
 * - 날짜 표현("내일", "18일" 등) → 그날 일정 전체를 시간순으로 (이름 매칭 시 상위)
 * - 그 외 → 제목 토큰 매칭, 임박한 일정 우선
 */
export function matchEventsByText(
  query: string,
  events: CalendarEvent[],
  limit = 6,
  now = new Date()
): CalendarEvent[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);

  const titleScore = (title: string) => {
    let score = 0;
    for (const t of tokens) if (title.includes(t)) score += t.length;
    if (title.length >= 2 && q.includes(title)) score += title.length * 2;
    return score;
  };
  const byTime = (a: CalendarEvent, b: CalendarEvent) =>
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime();

  // 날짜 표현이 있으면 그날 일정 목록을 우선 제공
  const dateHint = parseDateHint(q, now);
  if (dateHint) {
    return events
      .filter((ev) => getEventDateKey(ev) === dateHint)
      .sort((a, b) => titleScore(b.title.toLowerCase()) - titleScore(a.title.toLowerCase()) || byTime(a, b))
      .slice(0, limit);
  }

  if (tokens.length === 0) return [];
  return events
    .map((ev) => ({ ev, score: titleScore(ev.title.toLowerCase()) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || byTime(a.ev, b.ev))
    .slice(0, limit)
    .map((x) => x.ev);
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
  /** 수정 진입 시점의 반복 상태(변경 감지용) — 변경 없으면 recurrence를 PATCH에 안 보냄 */
  repeatBaseline?: { enabled: boolean; type: TodoFormState["repeatType"]; interval: number };
  reminderEnabled: boolean;
  reminderDate: string; // yyyy-mm-dd
  reminderTime: string; // HH:mm
  checklistItems: ChecklistDraftItem[];
}

export const EMPTY_TODO_FORM: TodoFormState = {
  open: false, mode: "create", listId: "", taskId: undefined,
  title: "", dueDate: "", importance: "normal", memo: "",
  repeatEnabled: false, repeatType: "daily", repeatInterval: 1,
  reminderEnabled: false, reminderDate: "", reminderTime: "09:00",
  checklistItems: [],
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

/** 폼의 알림 설정 → Graph isReminderOn/reminderDateTime (수정 시 해제는 null로 명시).
 *  Graph(특히 개인 계정)는 IANA timeZone 쓰기를 거부할 수 있어 UTC로 변환해 전송한다.
 *  (입력값은 사용자 로컬 시각 → 로컬로 해석 후 UTC 문자열로) */
export function buildTodoReminder(form: TodoFormState): Pick<TodoTaskUpdates, "isReminderOn" | "reminderDateTime"> {
  if (!form.reminderEnabled || !form.reminderDate) {
    return form.mode === "edit" ? { isReminderOn: false, reminderDateTime: null } : { isReminderOn: false };
  }
  const time = form.reminderTime || "09:00";
  const utc = new Date(`${form.reminderDate}T${time}:00`).toISOString().slice(0, 19); // 로컬→UTC
  return {
    isReminderOn: true,
    reminderDateTime: { dateTime: `${utc}.0000000`, timeZone: "UTC" },
  };
}

/** 반복 설정이 진입 시점 대비 바뀌었는지 → 바뀐 경우에만 PATCH에 recurrence 포함 */
function resolveRecurrence(form: TodoFormState): TodoTask["recurrence"] | null | undefined {
  if (form.mode !== "edit") return buildTodoRecurrence(form);
  const b = form.repeatBaseline;
  const unchanged = b
    ? b.enabled === form.repeatEnabled &&
      (!form.repeatEnabled || (b.type === form.repeatType && b.interval === form.repeatInterval))
    : !form.repeatEnabled; // baseline 없으면 원래 반복 없던 것으로 간주
  if (unchanged) return undefined; // 변경 없음 → 보내지 않아 서버 값 보존
  return buildTodoRecurrence(form); // 켜짐→새 규칙 / 꺼짐→null
}

/** 할일 폼 → Graph task 본문 (생성·수정 공통) */
export function buildTodoTaskFromForm(form: TodoFormState): TodoTaskUpdates & Pick<TodoTask, "title"> {
  const dueDateTime = form.dueDate
    ? { dateTime: `${form.dueDate}T00:00:00.0000000`, timeZone: "UTC" }
    : undefined;
  const recurrence = resolveRecurrence(form);
  return {
    title: form.title.trim(),
    importance: form.importance,
    ...(recurrence !== undefined ? { recurrence } : {}),
    ...buildTodoReminder(form),
    ...(dueDateTime ? { dueDateTime } : {}),
    ...(form.memo.trim() ? { body: { content: form.memo.trim(), contentType: "text" as const } } : {}),
  };
}

/** Unix ms → 로컬 날짜/시각 부품 (Graph UTC 값을 사용자 로컬로 표시) */
function localDateTimeParts(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: isoDate(d.getFullYear(), d.getMonth(), d.getDate()),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** 기존 할일 → 수정 폼 상태 (반복·알림·체크리스트 매핑 + timeZone 반영) */
export function todoEditFormState(todo: TodoItem): TodoFormState {
  const due = todo.dueDateTime
    ? localDateTimeParts(graphDateTimeToMs(todo.dueDateTime.dateTime, todo.dueDateTime.timeZone)).date
    : "";
  const reminder = todo.isReminderOn && todo.reminderDateTime
    ? localDateTimeParts(graphDateTimeToMs(todo.reminderDateTime.dateTime, todo.reminderDateTime.timeZone))
    : null;
  const repeatType = todo.recurrence?.pattern.type;
  const normalizedType: TodoFormState["repeatType"] =
    repeatType === "weekly" || repeatType === "absoluteMonthly" || repeatType === "absoluteYearly"
      ? repeatType
      : "daily";
  const repeatInterval = todo.recurrence?.pattern.interval ?? 1;
  return {
    open: true,
    mode: "edit",
    listId: todo.listId,
    taskId: todo.id,
    title: todo.title,
    dueDate: due,
    importance: todo.importance === "high" ? "high" : "normal",
    memo: todo.body?.content ?? "",
    repeatEnabled: !!todo.recurrence,
    repeatType: normalizedType,
    repeatInterval,
    repeatBaseline: { enabled: !!todo.recurrence, type: normalizedType, interval: repeatInterval },
    reminderEnabled: reminder !== null,
    reminderDate: reminder?.date ?? "",
    reminderTime: reminder?.time ?? "09:00",
    checklistItems: todo.checklistItems?.map((item) => ({
      id: item.id,
      displayName: item.displayName,
      isChecked: item.isChecked,
    })) ?? [],
  };
}
