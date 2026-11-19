// 할일 추가/수정 폼 도메인 — 폼 상태 타입과 서버(POST·PATCH /todos) 본문 빌더.
// schedule 페이지·todo 페이지·todo-form-modal이 공유한다.

import type {
  CreateTodoBody,
  Todo,
  TodoChecklistDraft,
  TodoRepeat,
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
  repeatType: TodoRepeat["type"];
  repeatInterval: number;
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
  repeatType: "daily",
  repeatInterval: 1,
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

export function recurrenceLabel(type: TodoRepeat["type"]): string {
  if (type === "daily") return "매일";
  if (type === "weekly") return "매주";
  if (type === "monthly") return "매월";
  return "매년";
}

/** "2주마다"처럼 간격이 1보다 클 때 붙이는 단위 */
export function repeatUnit(type: TodoRepeat["type"]): string {
  if (type === "daily") return "일";
  if (type === "weekly") return "주";
  if (type === "monthly") return "개월";
  return "년";
}

/** 반복 설명 — "매주" / "2주마다" */
export function repeatLabel(repeat: TodoRepeat): string {
  return repeat.interval > 1
    ? `${repeat.interval}${repeatUnit(repeat.type)}마다`
    : recurrenceLabel(repeat.type);
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
    // 반복은 마감일을 기준으로 다음 회차를 만든다 — 마감일이 없으면 오늘부터
    dueDate: form.dueDate || (form.repeatEnabled ? todayIsoDate() : null),
    importance: form.importance,
    repeat: form.repeatEnabled
      ? {
          type: form.repeatType,
          interval: Math.min(365, Math.max(1, form.repeatInterval || 1)),
        }
      : null,
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
    repeatType: todo.repeat?.type ?? "daily",
    repeatInterval: todo.repeat?.interval ?? 1,
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
