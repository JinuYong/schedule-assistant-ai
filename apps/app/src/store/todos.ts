import { create } from "zustand";
import { createSingleFlight } from "@/lib/promise-cache";
import { scheduleNotification, cancelNotification, cancelNotificationsByPrefix } from "@/lib/notifications";
import { graphDateTimeToMs } from "@/lib/date-utils";
import { MOCK_ENABLED, MOCK_TODOS, MOCK_TASKLISTS } from "@/lib/dev-mock";
import { showToast } from "./toast";
import {
  getTaskLists, getTasks,
  createTask as apiCreateTask,
  updateTask as apiUpdateTask,
  deleteTask as apiDeleteTask,
  completeTask as apiCompleteTask,
  toggleChecklistItem as apiToggleChecklistItem,
  createChecklistItem as apiCreateChecklistItem,
  updateChecklistItem as apiUpdateChecklistItem,
  deleteChecklistItem as apiDeleteChecklistItem,
  TodoTask,
  TodoTaskUpdates,
  ChecklistItem,
} from "@/lib/microsoft-todo";

export interface TodoItem extends TodoTask {
  id: string;
  listId: string;
  listName: string;
}

interface TodosStore {
  todos: TodoItem[];
  taskLists: { id: string; displayName: string }[]; // 실제 작업 목록(빈 목록도 카테고리·추가버튼 유지용)
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number;
  throttledUntil: number; // 429 쿨다운 만료 시각 (force 포함 모든 요청 차단)
  fetchTodos: (accessToken: string, force?: boolean) => Promise<void>;
  createTodo: (accessToken: string, listId: string, task: TodoTaskUpdates & Pick<TodoTask, "title">, checklistItems?: ChecklistDraftItem[]) => Promise<void>;
  updateTodo: (accessToken: string, listId: string, taskId: string, updates: TodoTaskUpdates, checklistItems?: ChecklistDraftItem[]) => Promise<void>;
  deleteTodo: (accessToken: string, listId: string, taskId: string) => Promise<void>;
  completeTodo: (accessToken: string, listId: string, taskId: string) => Promise<void>;
  toggleImportance: (accessToken: string, listId: string, taskId: string, current: "low" | "normal" | "high" | undefined) => Promise<void>;
  toggleChecklistItem: (accessToken: string, listId: string, taskId: string, itemId: string, isChecked: boolean) => Promise<void>;
}

const fetchTodosFlight = createSingleFlight<void>();

/** 알림 켜진 할일의 reminderDateTime에 데스크탑 알림 예약 (목록 갱신 시마다 재예약) */
function scheduleTodoNotifications(todos: TodoItem[]) {
  cancelNotificationsByPrefix("todo-");
  for (const t of todos) {
    if (!t.id || !t.isReminderOn || !t.reminderDateTime?.dateTime) continue;
    // Graph는 reminderDateTime을 보통 UTC로 돌려주므로 timeZone을 반영해 실제 순간으로 변환
    const ms = graphDateTimeToMs(t.reminderDateTime.dateTime, t.reminderDateTime.timeZone);
    if (Number.isNaN(ms) || ms <= Date.now()) continue;
    void scheduleNotification({
      id: `todo-${t.id}`,
      title: t.title,
      body: t.listName ? `${t.listName} · 할일 알림` : "할일 알림",
      time: ms,
    });
  }
}

export interface ChecklistDraftItem {
  id?: string;
  displayName: string;
  isChecked?: boolean;
}

async function syncChecklistItems(
  accessToken: string,
  listId: string,
  taskId: string,
  currentItems: ChecklistItem[] = [],
  nextItems: ChecklistDraftItem[] = []
) {
  const nextById = new Map(nextItems.filter((item) => item.id).map((item) => [item.id!, item]));
  for (const current of currentItems) {
    const next = nextById.get(current.id);
    if (!next || !next.displayName.trim()) {
      await apiDeleteChecklistItem(accessToken, listId, taskId, current.id);
    } else if (next.displayName.trim() !== current.displayName || next.isChecked !== current.isChecked) {
      await apiUpdateChecklistItem(accessToken, listId, taskId, current.id, {
        displayName: next.displayName.trim(),
        isChecked: next.isChecked ?? false,
      });
    }
  }

  for (const item of nextItems) {
    if (!item.id && item.displayName.trim()) {
      await apiCreateChecklistItem(accessToken, listId, taskId, item.displayName.trim());
    }
  }
}

export const useTodosStore = create<TodosStore>((set, get) => ({
  todos: MOCK_TODOS,
  taskLists: MOCK_TASKLISTS,
  isLoading: false,
  error: null,
  lastFetchedAt: 0,
  throttledUntil: 0,

  fetchTodos: async (accessToken, force = false) => {
    if (MOCK_ENABLED) return; // 더미 모드: 네트워크 건너뛰고 주입된 할일 유지
    if (fetchTodosFlight.inflight) return fetchTodosFlight.inflight;

    const now = Date.now();
    // 429 쿨다운 중이면 force 포함 모든 요청 차단
    if (now < get().throttledUntil) return;
    // 5분 이내 재요청 방지 (normal fetch만)
    if (!force && get().lastFetchedAt > 0 && now - get().lastFetchedAt < 5 * 60 * 1000) return;

    return fetchTodosFlight.run(async () => {
      set({ isLoading: true, error: null });
      try {
        const lists = await getTaskLists(accessToken);
        const results: TodoItem[] = [];

        // Microsoft Graph 429 방지를 위해 목록별 task 요청은 순차 처리한다.
        for (const list of lists) {
          const tasks = await getTasks(accessToken, list.id);
          for (const task of tasks) {
            if (task.id) {
              results.push({
                ...task,
                id: task.id,
                listId: list.id,
                listName: list.displayName,
              });
            }
          }
        }

        // 마감일 순 정렬 (마감일 없는 항목은 뒤로)
        results.sort((a, b) => {
          const da = a.dueDateTime?.dateTime ?? "9999";
          const db = b.dueDateTime?.dateTime ?? "9999";
          return da.localeCompare(db);
        });

        set({ todos: results, taskLists: lists, lastFetchedAt: Date.now() });
        scheduleTodoNotifications(results);
      } catch (err) {
        const retryAfter = (err as { retryAfter?: number }).retryAfter;
        const now2 = Date.now();
        // 429는 최소 5분 쿨다운 (Retry-After가 짧아도 루프 방지)
        const cooldown = retryAfter ? Math.max(retryAfter, 300) * 1000 : 0;
        set({
          error: err instanceof Error ? err.message : "할일 조회 실패",
          lastFetchedAt: now2,
          throttledUntil: cooldown ? now2 + cooldown : 0,
        });
      } finally {
        set({ isLoading: false });
      }
    });
  },

  createTodo: async (accessToken, listId, task, checklistItems = []) => {
    const created = await apiCreateTask(accessToken, listId, task as TodoTask);
    if (created.id && checklistItems.length > 0) {
      await syncChecklistItems(accessToken, listId, created.id, [], checklistItems);
    }
    await get().fetchTodos(accessToken, true);
  },

  updateTodo: async (accessToken, listId, taskId, updates, checklistItems) => {
    // 낙관적 업데이트 (null로 해제되는 필드는 제외 — 다음 fetch가 반영)
    const { recurrence, reminderDateTime, ...restUpdates } = updates;
    const optimisticUpdates: Partial<TodoTask> = {
      ...restUpdates,
      ...(recurrence ? { recurrence } : {}),
      ...(reminderDateTime ? { reminderDateTime } : {}),
    };
    set((s) => ({
      todos: s.todos.map((t) =>
        t.id !== taskId ? t : { ...t, ...optimisticUpdates }
      ),
    }));
    try {
      await apiUpdateTask(accessToken, listId, taskId, updates);
      if (checklistItems) {
        const current = get().todos.find((t) => t.id === taskId)?.checklistItems ?? [];
        await syncChecklistItems(accessToken, listId, taskId, current, checklistItems);
      }
      if (checklistItems) {
        await get().fetchTodos(accessToken, true);
      }
    } catch (e) {
      console.error("[updateTodo] 실패:", e);
      showToast(e instanceof Error ? `수정 실패: ${e.message}` : "할일 수정 실패");
      await get().fetchTodos(accessToken, true);
    }
  },

  deleteTodo: async (accessToken, listId, taskId) => {
    cancelNotification(`todo-${taskId}`);
    set((s) => ({ todos: s.todos.filter((t) => t.id !== taskId) }));
    try {
      await apiDeleteTask(accessToken, listId, taskId);
    } catch {
      await get().fetchTodos(accessToken, true);
    }
  },

  toggleImportance: async (accessToken, listId, taskId, current) => {
    const next = current === "high" ? "normal" : "high";
    set((s) => ({
      todos: s.todos.map((t) =>
        t.id !== taskId ? t : { ...t, importance: next }
      ),
    }));
    try {
      await apiUpdateTask(accessToken, listId, taskId, { importance: next });
    } catch {
      await get().fetchTodos(accessToken, true);
    }
  },

  completeTodo: async (accessToken, listId, taskId) => {
    // 낙관적 업데이트 — 즉시 목록에서 제거
    set((s) => ({ todos: s.todos.filter((t) => t.id !== taskId) }));
    try {
      await apiCompleteTask(accessToken, listId, taskId);
      // 반복 할일(recurrence) 완료 시 새 항목이 생성되므로 강제 새로고침
      await get().fetchTodos(accessToken, true);
    } catch {
      await get().fetchTodos(accessToken, true);
    }
  },

  toggleChecklistItem: async (accessToken, listId, taskId, itemId, isChecked) => {
    // 낙관적 업데이트
    set((s) => ({
      todos: s.todos.map((t) =>
        t.id !== taskId ? t : {
          ...t,
          checklistItems: t.checklistItems?.map((c) =>
            c.id !== itemId ? c : {
              ...c,
              isChecked,
              // 완료 시각 즉시 반영 → "방금 완료한 항목이 맨 아래로" 정렬이 새로고침 전에도 동작
              checkedDateTime: isChecked
                ? { dateTime: new Date().toISOString(), timeZone: "UTC" }
                : undefined,
            }
          ),
        }
      ),
    }));
    try {
      await apiToggleChecklistItem(accessToken, listId, taskId, itemId, isChecked);
    } catch {
      await get().fetchTodos(accessToken, true);
    }
  },
}));
