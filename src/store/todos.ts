import { create } from "zustand";
import { getTaskLists, getTasks, completeTask as apiCompleteTask, TodoTask } from "@/lib/microsoft-todo";

export interface TodoItem extends TodoTask {
  id: string;
  listId: string;
  listName: string;
}

interface TodosStore {
  todos: TodoItem[];
  isLoading: boolean;
  error: string | null;
  fetchTodos: (accessToken: string) => Promise<void>;
  completeTodo: (accessToken: string, listId: string, taskId: string) => Promise<void>;
}

export const useTodosStore = create<TodosStore>((set, get) => ({
  todos: [],
  isLoading: false,
  error: null,

  fetchTodos: async (accessToken) => {
    set({ isLoading: true, error: null });
    try {
      const lists = await getTaskLists(accessToken);
      const results: TodoItem[] = [];

      // 최대 5개 목록에서 미완료 할일 가져오기
      await Promise.all(
        lists.slice(0, 5).map(async (list) => {
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

      set({ todos: results });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "할일 조회 실패" });
    } finally {
      set({ isLoading: false });
    }
  },

  completeTodo: async (accessToken, listId, taskId) => {
    // 낙관적 업데이트 — 즉시 목록에서 제거
    set((s) => ({ todos: s.todos.filter((t) => t.id !== taskId) }));
    try {
      await apiCompleteTask(accessToken, listId, taskId);
    } catch {
      // 실패 시 다시 fetch
      const tokens = accessToken;
      await get().fetchTodos(tokens);
    }
  },
}));
