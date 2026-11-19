// Cali 서버(apps/server) 호출의 단일 진입점. 요청·응답 형식은 @cali/shared.
import type {
  ApiError,
  CompleteTodoResponse,
  CompletedTodosResponse,
  CreateTodoBody,
  LoginResponse,
  MeResponse,
  TodoChecklistItemResponse,
  TodoListResponse,
  TodoResponse,
  TodosResponse,
  UpdateTodoBody,
} from "@cali/shared";

/** 개발(bun run dev:tauri)은 로컬 서버(bun run dev:server), 배포 빌드는 운영. VITE_API_URL로 바꿀 수 있다 */
export const API_URL = (
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? "http://localhost:8787" : "https://cali-api.jinu.io")
).replace(/\/+$/, "");

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code?: ApiError["error"],
  ) {
    super(code ? `서버 오류 ${status} (${code})` : `서버 오류 ${status}`);
    this.name = "ApiRequestError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(res.status, body?.error);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  /** Google OAuth 교환 응답의 id_token으로 서버 세션을 받는다 */
  loginWithGoogle: (idToken: string) =>
    request<LoginResponse>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    }),
  me: (token: string) => request<MeResponse>("/me", { token }),
  logout: (token: string) =>
    request<void>("/auth/logout", { method: "POST", token }),

  /** 목록 전부(없으면 서버가 하나 만든다) + 미완료 할일 */
  todos: (token: string) => request<TodosResponse>("/todos", { token }),
  completedTodos: (token: string) =>
    request<CompletedTodosResponse>("/todos/completed", { token }),
  createTodo: (token: string, body: CreateTodoBody) =>
    request<TodoResponse>("/todos", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  /** 보낸 칸만 바뀐다. null은 지우기 */
  updateTodo: (token: string, id: number, body: UpdateTodoBody) =>
    request<TodoResponse>(`/todos/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),
  deleteTodo: (token: string, id: number) =>
    request<void>(`/todos/${id}`, { method: "DELETE", token }),
  /** 반복 할일이면 next에 다음 회차 */
  completeTodo: (token: string, id: number) =>
    request<CompleteTodoResponse>(`/todos/${id}/complete`, {
      method: "POST",
      token,
    }),
  reopenTodo: (token: string, id: number) =>
    request<TodoResponse>(`/todos/${id}/reopen`, { method: "POST", token }),
  checkTodoItem: (
    token: string,
    todoId: number,
    itemId: number,
    checked: boolean,
  ) =>
    request<TodoChecklistItemResponse>(`/todos/${todoId}/checklist/${itemId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ checked }),
    }),

  createTodoList: (token: string, name: string) =>
    request<TodoListResponse>("/todo-lists", {
      method: "POST",
      token,
      body: JSON.stringify({ name }),
    }),
  renameTodoList: (token: string, id: number, name: string) =>
    request<TodoListResponse>(`/todo-lists/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ name }),
    }),
  /** 목록 안 할일도 함께 지워진다 */
  deleteTodoList: (token: string, id: number) =>
    request<void>(`/todo-lists/${id}`, { method: "DELETE", token }),
};
