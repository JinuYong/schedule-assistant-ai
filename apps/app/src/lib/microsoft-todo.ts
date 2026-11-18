import { useAuthStore } from "@/store/auth";
import { createAuthenticatedFetch } from "./authenticated-fetch";
import { AuthError } from "./api-errors";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const graphFetch = createAuthenticatedFetch({
  baseUrl: GRAPH_BASE,
  refresh: (force) => useAuthStore.getState().refreshMicrosoft(force),
  jsonContentType: "write",
  emptyValue: null,
  rateLimitMessage: "Microsoft API 사용량 초과. 5분 후 새로고침 버튼을 눌러주세요.",
  parseError: async (res) => {
    if (res.status === 401) {
      return new AuthError("Microsoft 토큰이 만료되었습니다. 설정에서 재연결해주세요.");
    }
    const text = await res.text().catch(() => "");
    return new Error(`Graph API ${res.status}: ${text}`);
  },
});

export interface ChecklistItem {
  id: string;
  displayName: string;
  isChecked: boolean;
  checkedDateTime?: { dateTime: string; timeZone: string };
}

export interface TodoTask {
  id?: string;
  title: string;
  status?: "notStarted" | "inProgress" | "completed";
  importance?: "low" | "normal" | "high";
  recurrence?: { pattern: { type: string; interval: number }; range: { type: string } };
  dueDateTime?: { dateTime: string; timeZone: string };
  isReminderOn?: boolean;
  reminderDateTime?: { dateTime: string; timeZone: string };
  body?: { content: string; contentType: "text" | "html" };
  checklistItems?: ChecklistItem[];
}

export type TodoTaskUpdates = Partial<
  Omit<
    Pick<TodoTask, "title" | "dueDateTime" | "importance" | "body" | "recurrence" | "isReminderOn" | "reminderDateTime">,
    "recurrence" | "reminderDateTime"
  >
> & {
  recurrence?: TodoTask["recurrence"] | null;
  reminderDateTime?: TodoTask["reminderDateTime"] | null;
};

export async function getTaskLists(
  accessToken: string
): Promise<{ id: string; displayName: string }[]> {
  const data = await graphFetch<{ value: { id: string; displayName: string; wellknownListName?: string }[] }>(
    "/me/todo/lists",
    accessToken
  );
  // 'flaggedEmails'(Outlook 플래그 메일) 시스템 목록은 일반 할일 목록이 아니므로 제외
  return data.value
    .filter((l) => l.wellknownListName !== "flaggedEmails")
    .map(({ id, displayName }) => ({ id, displayName }));
}

export async function getTasks(
  accessToken: string,
  listId: string
): Promise<TodoTask[]> {
  const data = await graphFetch<{ value: TodoTask[] }>(
    `/me/todo/lists/${listId}/tasks?$top=100&$expand=checklistItems`,
    accessToken
  );
  return data.value.filter((t) => t.status !== "completed");
}

export async function createTask(
  accessToken: string,
  listId: string,
  task: TodoTask
): Promise<TodoTask> {
  return graphFetch<TodoTask>(
    `/me/todo/lists/${listId}/tasks`,
    accessToken,
    { method: "POST", body: JSON.stringify(task) }
  );
}

export async function createChecklistItem(
  accessToken: string,
  listId: string,
  taskId: string,
  displayName: string
): Promise<ChecklistItem> {
  return graphFetch<ChecklistItem>(
    `/me/todo/lists/${listId}/tasks/${taskId}/checklistItems`,
    accessToken,
    { method: "POST", body: JSON.stringify({ displayName }) }
  );
}

export async function toggleChecklistItem(
  accessToken: string,
  listId: string,
  taskId: string,
  itemId: string,
  isChecked: boolean
): Promise<void> {
  await graphFetch(
    `/me/todo/lists/${listId}/tasks/${taskId}/checklistItems/${itemId}`,
    accessToken,
    { method: "PATCH", body: JSON.stringify({ isChecked }) }
  );
}

export async function updateChecklistItem(
  accessToken: string,
  listId: string,
  taskId: string,
  itemId: string,
  updates: Partial<Pick<ChecklistItem, "displayName" | "isChecked">>
): Promise<ChecklistItem> {
  return graphFetch<ChecklistItem>(
    `/me/todo/lists/${listId}/tasks/${taskId}/checklistItems/${itemId}`,
    accessToken,
    { method: "PATCH", body: JSON.stringify(updates) }
  );
}

export async function updateTask(
  accessToken: string,
  listId: string,
  taskId: string,
  updates: TodoTaskUpdates
): Promise<TodoTask> {
  return graphFetch<TodoTask>(
    `/me/todo/lists/${listId}/tasks/${taskId}`,
    accessToken,
    { method: "PATCH", body: JSON.stringify(updates) }
  );
}

export async function deleteChecklistItem(
  accessToken: string,
  listId: string,
  taskId: string,
  itemId: string
): Promise<void> {
  await graphFetch<null>(
    `/me/todo/lists/${listId}/tasks/${taskId}/checklistItems/${itemId}`,
    accessToken,
    { method: "DELETE" }
  );
}

export async function deleteTask(
  accessToken: string,
  listId: string,
  taskId: string
): Promise<void> {
  await graphFetch<null>(
    `/me/todo/lists/${listId}/tasks/${taskId}`,
    accessToken,
    { method: "DELETE" }
  );
}

export async function completeTask(
  accessToken: string,
  listId: string,
  taskId: string
): Promise<TodoTask> {
  return graphFetch<TodoTask>(
    `/me/todo/lists/${listId}/tasks/${taskId}`,
    accessToken,
    { method: "PATCH", body: JSON.stringify({ status: "completed" }) }
  );
}
