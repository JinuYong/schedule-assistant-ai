import { useCallback } from "react";
import type { Todo } from "@cali/shared";
import { useTodosStore } from "@/store/todos";

/**
 * 할일 목록 행에서 쓰는 동작 묶음(schedule·todo 페이지 공용).
 * 행 클릭(펼치기)으로 번지지 않게 버튼 이벤트는 여기서 막는다.
 */
export function useTodoActions() {
  const completeTodo = useTodosStore((s) => s.completeTodo);
  const toggleImportance = useTodosStore((s) => s.toggleImportance);
  const deleteTodo = useTodosStore((s) => s.deleteTodo);
  const toggleChecklistItem = useTodosStore((s) => s.toggleChecklistItem);

  const complete = useCallback(
    (todo: Todo) => completeTodo(todo.id),
    [completeTodo],
  );

  const toggleImportanceAction = useCallback(
    (e: React.MouseEvent, todo: Todo) => {
      e.stopPropagation();
      return toggleImportance(todo);
    },
    [toggleImportance],
  );

  const remove = useCallback(
    (e: React.MouseEvent, todo: Todo) => {
      e.stopPropagation();
      return deleteTodo(todo.id);
    },
    [deleteTodo],
  );

  const toggleChecklist = useCallback(
    (todo: Todo, itemId: number, checked: boolean) =>
      toggleChecklistItem(todo.id, itemId, checked),
    [toggleChecklistItem],
  );

  return {
    complete,
    toggleImportance: toggleImportanceAction,
    remove,
    toggleChecklist,
  };
}
