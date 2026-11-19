import { useState } from "react";
import type { Todo } from "@cali/shared";
import { useTodosStore } from "@/store/todos";
import { IconChevron, IconTrash } from "@/components/icons";
import styles from "../page.module.css";

function completedLabel(iso: string) {
  return `${new Date(iso).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  })} 완료`;
}

/** 목록 아래 "완료됨 N" — 펼치면 최근 완료 순으로, 체크를 풀면 미완료로 돌아간다 */
export default function CompletedTodos({ items }: { items: Todo[] }) {
  const reopenTodo = useTodosStore((s) => s.reopenTodo);
  const deleteTodo = useTodosStore((s) => s.deleteTodo);
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className={styles.completed}>
      <button
        className={styles.completedToggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <IconChevron open={open} />
        완료됨 {items.length}
      </button>
      {open && (
        <ul className={styles.todoList}>
          {items.map((todo) => (
            <li
              key={todo.id}
              className={`${styles.todoItem} ${styles.completedItem}`}
            >
              <div className={styles.todoRow}>
                <button
                  className={`${styles.checkBtn} ${styles.checkBtnDone}`}
                  onClick={() => void reopenTodo(todo.id)}
                  title="완료 취소"
                />
                <p className={`${styles.todoText} ${styles.todoTextDone}`}>
                  {todo.title}
                </p>
                <div className={styles.actionBtns}>
                  <button
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                    onClick={() => void deleteTodo(todo.id)}
                    title="삭제"
                  >
                    <IconTrash />
                  </button>
                </div>
                {todo.completedAt && (
                  <span className={styles.completedAt}>
                    {completedLabel(todo.completedAt)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
