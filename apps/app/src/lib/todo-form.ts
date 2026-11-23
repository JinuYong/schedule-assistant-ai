// 할일 추가/수정 폼 도메인 — 폼 상태 타입과 서버(POST·PATCH /todos) 본문 빌더.
// schedule 페이지·todo 페이지·todo-form-modal이 공유한다.

import {
  firstOccurrence,
  weekdayOf,
  type CreateTodoBody,
  type Todo,
  type TodoChecklistDraft,
  type TodoRepeat,
} from "@cali/shared";
import { isoDate, todayIsoDate } from "@/lib/date-utils";

/** 폼에서 편집 중인 체크리스트 항목. 새 항목은 id가 없고, 저장 전엔 빈 칸일 수 있다 */
export interface ChecklistDraftItem {
  id?: number;
  title: string;
  checked: boolean;
}

export interface TodoFormState {
  open: boolean;
  mode: "create" | "edit";
  listId: number;
  taskId?: number;
  title: string;
  dueDate: string;
  importance: "normal" | "high";
  memo: string;
  repeatEnabled: boolean;
  /** 반복을 꺼 둬도 고른 값은 남겨 둔다(다시 켜면 그대로) */
  repeat: TodoRepeat;
  reminderEnabled: boolean;
  reminderDate: string; // yyyy-mm-dd
  reminderTime: string; // HH:mm
  checklistItems: ChecklistDraftItem[];
}

export const EMPTY_TODO_FORM: TodoFormState = {
  open: false,
  mode: "create",
  listId: 0,
  taskId: undefined,
  title: "",
  dueDate: "",
  importance: "normal",
  memo: "",
  repeatEnabled: false,
  repeat: { type: "daily", days: "all" },
  reminderEnabled: false,
  reminderDate: "",
  reminderTime: "09:00",
  checklistItems: [],
};

/** 체크리스트 표시 정렬 — 미완료(기존 순서 유지) 먼저, 완료는 맨 아래.
 *  완료 그룹은 체크한 시각 오름차순이라 **방금 체크한 항목이 가장 아래** */
export function sortChecklistByDone<T extends { checkedAt: string | null }>(
  items: T[],
): T[] {
  return items.toSorted((a, b) => {
    if (!a.checkedAt || !b.checkedAt)
      return (a.checkedAt ? 1 : 0) - (b.checkedAt ? 1 : 0);
    return a.checkedAt.localeCompare(b.checkedAt);
  });
}

const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const WEEK_ORDINALS: Record<number, string> = {
  1: "첫째",
  2: "둘째",
  3: "셋째",
  4: "넷째",
  [-1]: "마지막",
};

export const weekdayName = (weekday: number) => WEEKDAY_NAMES[weekday] ?? "";

type MonthlyOn = Extract<TodoRepeat, { type: "monthly" }>["on"];

/** 매월 반복 기준 이름 — "20일" / "첫날" / "마지막 날" / "셋째 주 목요일" */
export function monthlyOnLabel(on: MonthlyOn): string {
  if (on.kind === "lastDay") return "마지막 날";
  if (on.kind === "weekday")
    return `${WEEK_ORDINALS[on.week]} 주 ${weekdayName(on.weekday)}요일`;
  return on.day === 1 ? "첫날" : `${on.day}일`;
}

/** 반복 설명 — "평일마다", "2주마다 월·수", "매월 마지막 날", "매년 11월 20일" */
export function repeatLabel(repeat: TodoRepeat): string {
  switch (repeat.type) {
    case "daily":
      return { all: "매일", weekdays: "평일마다", weekends: "주말마다" }[
        repeat.days
      ];
    case "weekly":
      return `${repeat.interval > 1 ? `${repeat.interval}주마다` : "매주"} ${repeat.weekdays.map(weekdayName).join("·")}`;
    case "monthly":
      return `${repeat.interval > 1 ? `${repeat.interval}개월마다` : "매월"} ${monthlyOnLabel(repeat.on)}`;
    case "yearly":
      return `매년 ${repeat.month}월 ${repeat.day}일`;
  }
}

/** 마감일의 몇째 주인지(1~4, 다섯째는 마지막 주로) */
function weekOfMonth(date: string): 1 | 2 | 3 | 4 | -1 {
  const n = Math.ceil(Number(date.slice(8, 10)) / 7);
  return n >= 5 ? -1 : (n as 1 | 2 | 3 | 4);
}

/** 매월 반복에서 고를 수 있는 기준들. 마감일에서 날짜·N번째 요일을 뽑는다 */
export function monthlyOptions(date: string): MonthlyOn[] {
  const day = Number(date.slice(8, 10));
  const options: MonthlyOn[] = [];
  if (day !== 1) options.push({ kind: "day", day });
  options.push({ kind: "day", day: 1 }, { kind: "lastDay" });
  options.push({
    kind: "weekday",
    week: weekOfMonth(date),
    weekday: weekdayOf(date),
  });
  return options;
}

/** 반복 종류를 바꿀 때의 기본값 — 마감일(없으면 오늘)에 맞춘다 */
export function defaultRepeat(
  type: TodoRepeat["type"],
  date: string,
): TodoRepeat {
  switch (type) {
    case "daily": {
      // 마감일이 주말이면 주말, 아니면 평일부터 켜 둔다
      const w = weekdayOf(date);
      return { type, days: w === 0 || w === 6 ? "weekends" : "weekdays" };
    }
    case "weekly":
      return { type, interval: 1, weekdays: [weekdayOf(date)] };
    case "monthly":
      return {
        type,
        interval: 1,
        on: { kind: "day", day: Number(date.slice(8, 10)) },
      };
    case "yearly":
      return {
        type,
        month: Number(date.slice(5, 7)),
        day: Number(date.slice(8, 10)),
      };
  }
}

/**
 * 마감일을 손으로 바꿨을 때 마감일에서 뽑은 반복 값(평일/주말, 매월 날짜·N번째 요일, 매년 월·일)을 새 날짜로 옮긴다.
 * 매일(평일·주말 둘 다), 매주 요일, "첫날"·"마지막 날"은 그대로 둔다(저장할 때 마감일을 패턴에 맞춘다).
 */
export function reanchorRepeat(repeat: TodoRepeat, date: string): TodoRepeat {
  if (repeat.type === "daily")
    return repeat.days === "all" ? repeat : defaultRepeat("daily", date);
  if (repeat.type === "yearly") return defaultRepeat("yearly", date);
  if (repeat.type !== "monthly") return repeat;
  const { on } = repeat;
  if (on.kind === "lastDay" || (on.kind === "day" && on.day === 1))
    return repeat;
  if (on.kind === "day")
    return { ...repeat, on: { kind: "day", day: Number(date.slice(8, 10)) } };
  return {
    ...repeat,
    on: { kind: "weekday", week: weekOfMonth(date), weekday: weekdayOf(date) },
  };
}

/** 반복이 켜져 있으면 첫 회차가 될 마감일(패턴에 안 맞으면 그 뒤 첫 맞는 날, 비어 있으면 오늘부터) */
export function effectiveDueDate(form: TodoFormState): string | null {
  if (!form.repeatEnabled) return form.dueDate || null;
  return firstOccurrence(form.dueDate || todayIsoDate(), form.repeat);
}

/**
 * 저장 전 체크리스트 정리.
 *
 * 폼에서 항목을 추가하면 빈 칸이 먼저 생기므로, 채우지 않은 칸은 저장하지 않는다.
 * 앞뒤 공백도 함께 다듬는다.
 */
export function cleanChecklistItems(
  items: ChecklistDraftItem[],
): TodoChecklistDraft[] {
  return items
    .map((item) => ({ ...item, title: item.title.trim() }))
    .filter((item) => item.title);
}

/** 폼의 알림(로컬 날짜·시각) → UTC ISO. 꺼져 있으면 null */
function reminderAt(form: TodoFormState): string | null {
  if (!form.reminderEnabled || !form.reminderDate) return null;
  return new Date(
    `${form.reminderDate}T${form.reminderTime || "09:00"}:00`,
  ).toISOString();
}

/** 할일 폼 → 서버 본문(만들기·고치기 공통). 고칠 때도 모든 칸을 보내 폼 그대로 맞춘다 */
export function buildTodoBody(form: TodoFormState): CreateTodoBody {
  return {
    listId: form.listId,
    title: form.title.trim(),
    memo: form.memo.trim(),
    // 반복은 마감일을 첫 회차로 다음 회차를 만든다 — 패턴에 맞는 날로 옮겨 보낸다
    dueDate: effectiveDueDate(form),
    importance: form.importance,
    repeat: form.repeatEnabled ? form.repeat : null,
    reminderAt: reminderAt(form),
    checklist: cleanChecklistItems(form.checklistItems),
  };
}

/** UTC ISO → 로컬 날짜/시각 부품 */
function localDateTimeParts(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: isoDate(d.getFullYear(), d.getMonth(), d.getDate()),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** 기존 할일 → 수정 폼 상태 */
export function todoEditFormState(todo: Todo): TodoFormState {
  const reminder = todo.reminderAt ? localDateTimeParts(todo.reminderAt) : null;
  return {
    open: true,
    mode: "edit",
    listId: todo.listId,
    taskId: todo.id,
    title: todo.title,
    dueDate: todo.dueDate ?? "",
    importance: todo.importance,
    memo: todo.memo,
    repeatEnabled: !!todo.repeat,
    repeat: todo.repeat ?? EMPTY_TODO_FORM.repeat,
    reminderEnabled: reminder !== null,
    reminderDate: reminder?.date ?? "",
    reminderTime: reminder?.time ?? "09:00",
    checklistItems: sortChecklistByDone(todo.checklist).map((item) => ({
      id: item.id,
      title: item.title,
      checked: item.checkedAt !== null,
    })),
  };
}
