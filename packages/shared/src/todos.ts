import { z } from "zod";

// 날짜는 "YYYY-MM-DD"(마감일처럼 시각이 없는 것), 시각은 UTC ISO("…Z", 알림·완료처럼 순간인 것)

export const todoImportance = z.enum(["normal", "high"]);
export type TodoImportance = z.infer<typeof todoImportance>;

/** 반복. 완료하면 서버가 마감·알림을 interval만큼 뒤로 민 다음 회차를 만든다 */
export const todoRepeat = z.object({
  type: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.int().min(1).max(365),
});
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
