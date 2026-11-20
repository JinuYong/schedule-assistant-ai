import { z } from "zod";

// 날짜는 "YYYY-MM-DD"(마감일처럼 시각이 없는 것), 시각은 UTC ISO("…Z", 알림·완료처럼 순간인 것)

export const todoImportance = z.enum(["normal", "high"]);
export type TodoImportance = z.infer<typeof todoImportance>;

const weekday = z.int().min(0).max(6); // 0=일 … 6=토

/**
 * 반복. 완료하면 서버가 다음 회차(recurrence.ts nextOccurrence)를 새 할일로 만든다.
 * - daily: 매일 / 평일 / 주말
 * - weekly: N주마다, 고른 요일들
 * - monthly: N개월마다, 날짜(1일 = 첫날, 31일은 말일로) / 마지막 날 / N번째 요일(-1 = 마지막 주)
 * - yearly: 매년 그 월·일
 */
export const todoRepeat = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("daily"),
    days: z.enum(["all", "weekdays", "weekends"]),
  }),
  z.object({
    type: z.literal("weekly"),
    interval: z.int().min(1).max(52),
    weekdays: z
      .array(weekday)
      .min(1)
      .max(7)
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  }),
  z.object({
    type: z.literal("monthly"),
    interval: z.int().min(1).max(12),
    on: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("day"), day: z.int().min(1).max(31) }),
      z.object({ kind: z.literal("lastDay") }),
      z.object({
        kind: z.literal("weekday"),
        week: z.union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(-1),
        ]),
        weekday,
      }),
    ]),
  }),
  z.object({
    type: z.literal("yearly"),
    month: z.int().min(1).max(12),
    day: z.int().min(1).max(31),
  }),
]);
export type TodoRepeat = z.infer<typeof todoRepeat>;

export interface TodoList {
  id: number;
  name: string;
}

export interface TodoChecklistItem {
  id: number;
  title: string;
  /** 체크한 시각. 체크 안 했으면 null */
  checkedAt: string | null;
}

export interface Todo {
  id: number;
  listId: number;
  title: string;
  memo: string;
  dueDate: string | null;
  importance: TodoImportance;
  repeat: TodoRepeat | null;
  reminderAt: string | null;
  /** 완료한 시각. 미완료면 null */
  completedAt: string | null;
  checklist: TodoChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

/** POST /todo-lists, PATCH /todo-lists/:id */
export const todoListBody = z.object({
  name: z.string().trim().min(1).max(100),
});
export type TodoListBody = z.infer<typeof todoListBody>;

/** 할일을 저장할 때 보내는 체크리스트 전체. 여기 없는 기존 항목은 지운다.
 *  id는 기존 항목이면 붙인다 — 체크 시각을 그대로 두기 위해서 */
export const todoChecklistDraft = z.object({
  id: z.int().positive().optional(),
  title: z.string().trim().min(1).max(500),
  checked: z.boolean(),
});
export type TodoChecklistDraft = z.infer<typeof todoChecklistDraft>;

const todoFields = {
  listId: z.int().positive(),
  title: z.string().trim().min(1).max(500),
  memo: z.string().max(10_000),
  dueDate: z.iso.date().nullable(),
  importance: todoImportance,
  repeat: todoRepeat.nullable(),
  reminderAt: z.iso.datetime().nullable(),
  checklist: z.array(todoChecklistDraft).max(100),
};

/** POST /todos — listId·title 말고는 생략하면 비어 있는 값 */
export const createTodoBody = z.object(todoFields).partial().required({
  listId: true,
  title: true,
});
export type CreateTodoBody = z.infer<typeof createTodoBody>;

/** PATCH /todos/:id — 보낸 칸만 바꾼다. null은 지우기 */
export const updateTodoBody = z.object(todoFields).partial();
export type UpdateTodoBody = z.infer<typeof updateTodoBody>;

/** PATCH /todos/:id/checklist/:itemId */
export const checkTodoItemBody = z.object({ checked: z.boolean() });
export type CheckTodoItemBody = z.infer<typeof checkTodoItemBody>;

/** GET /todos — 목록 전부(없으면 서버가 하나 만든다)와 미완료 할일 */
export interface TodosResponse {
  lists: TodoList[];
  todos: Todo[];
}

/** GET /todos/completed — 최근에 완료한 순 */
export interface CompletedTodosResponse {
  todos: Todo[];
}

export interface TodoListResponse {
  list: TodoList;
}

export interface TodoResponse {
  todo: Todo;
}

/** POST /todos/:id/complete — 반복 할일이면 next에 새로 만든 다음 회차 */
export interface CompleteTodoResponse {
  todo: Todo;
  next: Todo | null;
}

export interface TodoChecklistItemResponse {
  item: TodoChecklistItem;
}
