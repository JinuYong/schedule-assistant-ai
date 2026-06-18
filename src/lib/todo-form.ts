// 할일 추가/수정 폼 도메인 — 폼 상태 타입과 Graph(todoTask) 본문 빌더.
// schedule 페이지·todo 페이지·todo-form-modal이 공유한다.

import { ChecklistDraftItem, TodoItem } from "@/store/todos";
import { TodoTask, TodoTaskUpdates } from "@/lib/microsoft-todo";
import { graphDateTimeToMs, isoDate } from "@/lib/date-utils";

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
