const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function graphFetch<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const isWrite = options.method && options.method !== "GET";
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(isWrite ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    if (res.status === 429) {
      const retry = parseInt(res.headers.get("Retry-After") ?? "60", 10);
      const err = new Error("Microsoft API 사용량 초과. 5분 후 새로고침 버튼을 눌러주세요.") as Error & { retryAfter: number };
      err.retryAfter = retry;
      throw err;
    }
    if (res.status === 401) {
      const err = new Error("Microsoft 토큰이 만료되었습니다. 설정에서 재연결해주세요.") as Error & { needsReauth: boolean };
      err.needsReauth = true;
      throw err;
    }
    const text = await res.text().catch(() => "");
    throw new Error(`Graph API ${res.status}: ${text}`);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

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
  dueDateTime?: { dateTime: string; timeZone: string };
  body?: { content: string; contentType: "text" | "html" };
  checklistItems?: ChecklistItem[];
}

export async function getTaskLists(
  accessToken: string
): Promise<{ id: string; displayName: string }[]> {
  const data = await graphFetch<{ value: { id: string; displayName: string }[] }>(
    "/me/todo/lists",
    accessToken
  );
  return data.value;
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