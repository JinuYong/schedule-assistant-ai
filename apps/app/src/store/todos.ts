import { create } from "zustand";
import type {
  CreateTodoBody,
  Todo,
  TodoList,
  UpdateTodoBody,
} from "@cali/shared";
import { api, ApiRequestError } from "@/lib/api";
import { MOCK_ENABLED, MOCK_TODOS, MOCK_TODO_LISTS } from "@/lib/dev-mock";
import {
  scheduleNotification,
  cancelNotificationsByPrefix,
} from "@/lib/notifications";
import { createSingleFlight } from "@/lib/promise-cache";
import { useAccountStore } from "./account";
import { showToast } from "./toast";

interface TodosStore {
  lists: TodoList[];
  /** 미완료 할일(마감일 순, 마감일 없는 건 뒤) */
  todos: Todo[];
  /** 최근에 완료한 할일. 할일 화면을 열 때 불러온다 */
  completed: Todo[];
  isLoading: boolean;
  error: string | null;
  fetchTodos: () => Promise<void>;
  fetchCompleted: () => Promise<void>;
  /** 실패하면 토스트를 띄우고 false — 폼을 닫지 않게 */
  createTodo: (body: CreateTodoBody) => Promise<boolean>;
  updateTodo: (id: number, body: UpdateTodoBody) => Promise<boolean>;
  deleteTodo: (id: number) => Promise<void>;
  completeTodo: (id: number) => Promise<void>;
  reopenTodo: (id: number) => Promise<void>;
  toggleImportance: (todo: Todo) => Promise<void>;
  toggleChecklistItem: (
    todoId: number,
    itemId: number,
    checked: boolean,
  ) => Promise<void>;
  createList: (name: string) => Promise<boolean>;
  renameList: (id: number, name: string) => Promise<boolean>;
  /** 목록 안 할일도 함께 지워진다 */
  deleteList: (id: number) => Promise<void>;
}

const fetchFlight = createSingleFlight<void>();

function sortOpen(todos: Todo[]): Todo[] {
  return todos.toSorted(
    (a, b) =>
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.id - b.id,
  );
}

const replaceIn = (todos: Todo[], todo: Todo) =>
  todos.map((t) => (t.id === todo.id ? todo : t));

/** 로그인 세션 토큰. 앱은 SignInGate 안에서만 할일을 다루므로 없으면 이상한 상태다 */
function token(): string {
  const t = useAccountStore.getState().session?.token;
  if (!t) throw new Error("로그인이 필요합니다");
  return t;
}

/** 실패 처리: 세션이 만료(401)면 계정 확인으로 로그인 화면을 띄우고, 아니면 토스트 */
function fail(e: unknown, message: string) {
  console.error(`[todos] ${message}`, e);
  if (e instanceof ApiRequestError && e.status === 401) {
    void useAccountStore.getState().refreshMe();
    return;
  }
  showToast(message);
}

/** 알림 켠 할일의 알림 시각에 데스크톱 알림 예약(할일이 바뀔 때마다 다시) */
function scheduleTodoNotifications(todos: Todo[], lists: TodoList[]) {
  cancelNotificationsByPrefix("todo-");
  const now = Date.now();
  for (const t of todos) {
    if (!t.reminderAt) continue;
    const time = Date.parse(t.reminderAt);
    if (Number.isNaN(time) || time <= now) continue;
    const listName = lists.find((l) => l.id === t.listId)?.name;
    void scheduleNotification({
      id: `todo-${t.id}`,
      title: t.title,
      body: listName ? `${listName} · 할일 알림` : "할일 알림",
      time,
    });
  }
}

export const useTodosStore = create<TodosStore>((set, get) => {
  /** 서버 응답을 반영. 실패하면 서버 상태로 다시 맞춘다 */
  const refetch = () => get().fetchTodos();

  return {
    lists: MOCK_TODO_LISTS,
    todos: sortOpen(MOCK_TODOS),
    completed: [],
    isLoading: false,
    error: null,

    fetchTodos: async () => {
      if (MOCK_ENABLED) return; // 더미 모드: 주입된 할일 유지
      if (fetchFlight.inflight) return fetchFlight.inflight;
      return fetchFlight.run(async () => {
        set({ isLoading: true, error: null });
        try {
          const { lists, todos } = await api.todos(token());
          set({ lists, todos: sortOpen(todos) });
        } catch (e) {
          console.error("[todos] 조회 실패", e);
          if (e instanceof ApiRequestError && e.status === 401)
            void useAccountStore.getState().refreshMe();
          set({ error: "할일을 불러오지 못했습니다." });
        } finally {
          set({ isLoading: false });
        }
      });
    },

    fetchCompleted: async () => {
      if (MOCK_ENABLED) return;
      try {
        const { todos } = await api.completedTodos(token());
        set({ completed: todos });
      } catch (e) {
        fail(e, "완료한 할일을 불러오지 못했습니다.");
      }
    },

    createTodo: async (body) => {
      try {
        const { todo } = await api.createTodo(token(), body);
        set((s) => ({ todos: sortOpen([...s.todos, todo]) }));
        return true;
      } catch (e) {
        fail(e, "할일을 추가하지 못했습니다.");
        return false;
      }
    },

    updateTodo: async (id, body) => {
      try {
        const { todo } = await api.updateTodo(token(), id, body);
        set((s) => ({
          todos: sortOpen(replaceIn(s.todos, todo)),
          completed: replaceIn(s.completed, todo),
        }));
        return true;
      } catch (e) {
        fail(e, "할일을 고치지 못했습니다.");
        return false;
      }
    },

    deleteTodo: async (id) => {
      set((s) => ({
        todos: s.todos.filter((t) => t.id !== id),
        completed: s.completed.filter((t) => t.id !== id),
      }));
      try {
        await api.deleteTodo(token(), id);
      } catch (e) {
        fail(e, "할일을 지우지 못했습니다.");
        await refetch();
      }
    },

    completeTodo: async (id) => {
      // 바로 목록에서 뺀다. 반복 할일은 응답의 다음 회차를 넣는다
      set((s) => ({ todos: s.todos.filter((t) => t.id !== id) }));
      try {
        const { todo, next } = await api.completeTodo(token(), id);
        set((s) => ({
          completed: [todo, ...s.completed.filter((t) => t.id !== id)],
          todos: next ? sortOpen([...s.todos, next]) : s.todos,
        }));
      } catch (e) {
        fail(e, "할일을 완료하지 못했습니다.");
        await refetch();
      }
    },

    reopenTodo: async (id) => {
      set((s) => ({ completed: s.completed.filter((t) => t.id !== id) }));
      try {
        const { todo } = await api.reopenTodo(token(), id);
        set((s) => ({
          todos: sortOpen([...s.todos.filter((t) => t.id !== id), todo]),
        }));
      } catch (e) {
        fail(e, "할일을 되돌리지 못했습니다.");
        await Promise.all([refetch(), get().fetchCompleted()]);
      }
    },

    toggleImportance: async (todo) => {
      const importance = todo.importance === "high" ? "normal" : "high";
      set((s) => ({ todos: replaceIn(s.todos, { ...todo, importance }) }));
      try {
        await api.updateTodo(token(), todo.id, { importance });
      } catch (e) {
        fail(e, "중요 표시를 바꾸지 못했습니다.");
        await refetch();
      }
    },

    toggleChecklistItem: async (todoId, itemId, checked) => {
      const checkedAt = checked ? new Date().toISOString() : null;
      set((s) => ({
        todos: s.todos.map((t) =>
          t.id !== todoId
            ? t
            : {
                ...t,
                checklist: t.checklist.map((c) =>
                  c.id === itemId ? { ...c, checkedAt } : c,
                ),
              },
        ),
      }));
      try {
        await api.checkTodoItem(token(), todoId, itemId, checked);
      } catch (e) {
        fail(e, "체크리스트를 바꾸지 못했습니다.");
        await refetch();
      }
    },

    createList: async (name) => {
      try {
        const { list } = await api.createTodoList(token(), name);
        set((s) => ({ lists: [...s.lists, list] }));
        return true;
      } catch (e) {
        fail(e, "목록을 만들지 못했습니다.");
        return false;
      }
    },

    renameList: async (id, name) => {
      try {
        const { list } = await api.renameTodoList(token(), id, name);
        set((s) => ({ lists: s.lists.map((l) => (l.id === id ? list : l)) }));
        return true;
      } catch (e) {
        fail(e, "목록 이름을 바꾸지 못했습니다.");
        return false;
      }
    },

    deleteList: async (id) => {
      set((s) => ({
        lists: s.lists.filter((l) => l.id !== id),
        todos: s.todos.filter((t) => t.listId !== id),
        completed: s.completed.filter((t) => t.listId !== id),
      }));
      try {
        await api.deleteTodoList(token(), id);
      } catch (e) {
        fail(e, "목록을 지우지 못했습니다.");
        await refetch();
      }
    },
  };
});

// 미완료 할일이나 목록 이름이 바뀌면 알림을 다시 예약한다(어느 동작이 바꿨든 한 곳에서)
useTodosStore.subscribe((s, prev) => {
  if (s.todos !== prev.todos || s.lists !== prev.lists)
    scheduleTodoNotifications(s.todos, s.lists);
});
