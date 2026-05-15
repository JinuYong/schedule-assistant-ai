import { create } from "zustand";
import { getTaskLists, getTasks, completeTask as apiCompleteTask, toggleChecklistItem as apiToggleChecklistItem, TodoTask } from "@/lib/microsoft-todo";

export interface TodoItem extends TodoTask {
  id: string;
  listId: string;
  listName: string;
}

interface TodosStore {
  todos: TodoItem[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number;
  throttledUntil: number; // 429 쿨다운 만료 시각 (force 포함 모든 요청 차단)
  fetchTodos: (accessToken: string, force?: boolean) => Promise<void>;
  completeTodo: (accessToken: string, listId: string, taskId: string) => Promise<void>;
  toggleChecklistItem: (accessToken: string, listId: string, taskId: string, itemId: string, isChecked: boolean) => Promise<void>;
}

export const useTodosStore = create<TodosStore>((set, get) => ({
  todos: [],
  isLoading: false,
  error: null,
  lastFetchedAt: 0,
  throttledUntil: 0,

  fetchTodos: async (accessToken, force = false) => {
    const now = Date.now();
    // 429 쿨다운 중이면 force 포함 모든 요청 차단
    if (now < get().throttledUntil) return;
    // 5분 이내 재요청 방지 (normal fetch만)
    if (!force && get().lastFetchedAt > 0 && now - get().lastFetchedAt < 5 * 60 * 1000) return;
    set({ isLoading: true, error: null });
    try {
      const lists = await getTaskLists(accessToken);
      const results: TodoItem[] = [];

      // 모든 목록에서 미완료 할일 가져오기
      await Promise.all(
        lists.map(async (list) => {
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
        })
      );

      // 마감일 순 정렬 (마감일 없는 항목은 뒤로)
      results.sort((a, b) => {
        const da = a.dueDateTime?.dateTime ?? "9999";
        const db = b.dueDateTime?.dateTime ?? "9999";
        return da.localeCompare(db);
      });

      set({ todos: results, lastFetchedAt: Date.now() });
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
            c.id !== itemId ? c : { ...c, isChecked }
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