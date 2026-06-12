import { useCallback } from "react";
import { useTodosStore, TodoItem } from "@/store/todos";

/**
 * Microsoft Todo CRUD 핸들러 묶음.
 *
 * schedule 페이지(refreshMicrosoft 경유)와 todo 페이지(저장 토큰 직접 사용)에서
 * 반복되던 "토큰 확보 → 없으면 무시 → 스토어 액션 호출" 래퍼를 통합한다.
 * 토큰 확보 방식만 resolveToken 으로 주입받는다.
 */
export function useTodoActions(resolveToken: () => Promise<string | null>) {
  const completeTodo = useTodosStore((s) => s.completeTodo);
  const toggleImportance = useTodosStore((s) => s.toggleImportance);
  const deleteTodo = useTodosStore((s) => s.deleteTodo);
  const toggleChecklistItem = useTodosStore((s) => s.toggleChecklistItem);

  const complete = useCallback(async (todo: TodoItem) => {
    const token = await resolveToken();
    if (!token) return;
    await completeTodo(token, todo.listId, todo.id);
  }, [resolveToken, completeTodo]);

  const toggleImportanceAction = useCallback(async (e: React.MouseEvent, todo: TodoItem) => {
    e.stopPropagation();
    const token = await resolveToken();
    if (!token) return;
    await toggleImportance(token, todo.listId, todo.id, todo.importance);
  }, [resolveToken, toggleImportance]);

  const remove = useCallback(async (e: React.MouseEvent, todo: TodoItem) => {
    e.stopPropagation();
    const token = await resolveToken();
    if (!token) return;
    await deleteTodo(token, todo.listId, todo.id);
  }, [resolveToken, deleteTodo]);

  const toggleChecklist = useCallback(async (todo: TodoItem, itemId: string, isChecked: boolean) => {
    const token = await resolveToken();
    if (!token) return;
    await toggleChecklistItem(token, todo.listId, todo.id, itemId, isChecked);
  }, [resolveToken, toggleChecklistItem]);

  return { complete, toggleImportance: toggleImportanceAction, remove, toggleChecklist };
}
