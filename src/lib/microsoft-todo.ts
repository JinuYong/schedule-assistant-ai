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
    const text = await res.text().catch(() => "");
    throw new Error(`Graph API ${res.status}: ${text}`);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export interface TodoTask {
  id?: string;
  title: string;
  status?: "notStarted" | "inProgress" | "completed";
  dueDateTime?: { dateTime: string; timeZone: string };
  body?: { content: string; contentType: "text" | "html" };
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
    `/me/todo/lists/${listId}/tasks`,
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