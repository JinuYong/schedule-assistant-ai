"use client";

import { useEffect, useCallback, useMemo } from "react";
import { useAuthStore } from "@/store/auth";
import { useTodosStore, TodoItem } from "@/store/todos";
import styles from "./page.module.css";
import { formatDue } from "@/lib/date-utils";

function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6"/>
      <path d="M21 13a9 9 0 1 1-3-7.7L21 8"/>
    </svg>
  );
}


export default function TodoPage() {
  const { microsoftTokens } = useAuthStore();
  const { todos, isLoading, error, fetchTodos, completeTodo, toggleChecklistItem } = useTodosStore();

  const loadTodos = useCallback(async (force = false) => {
    if (!microsoftTokens?.access_token) return;
    await fetchTodos(microsoftTokens.access_token, force);
  }, [microsoftTokens, fetchTodos]);

  useEffect(() => {
    if (!microsoftTokens?.access_token) return;
    fetchTodos(microsoftTokens.access_token);
  }, [microsoftTokens?.access_token]); // eslint-disable-line

  const handleComplete = useCallback(async (todo: TodoItem) => {
    if (!microsoftTokens?.access_token) return;
    await completeTodo(microsoftTokens.access_token, todo.listId, todo.id);
  }, [microsoftTokens, completeTodo]);

  const handleToggleChecklist = useCallback(async (
    todo: TodoItem, itemId: string, isChecked: boolean
  ) => {
    if (!microsoftTokens?.access_token) return;
    await toggleChecklistItem(microsoftTokens.access_token, todo.listId, todo.id, itemId, isChecked);
  }, [microsoftTokens, toggleChecklistItem]);

  // 리스트별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, { listName: string; items: TodoItem[] }>();
    for (const todo of todos) {
      if (!map.has(todo.listId)) {
        map.set(todo.listId, { listName: todo.listName, items: [] });
      }
      map.get(todo.listId)!.items.push(todo);
    }
    return Array.from(map.values());
  }, [todos]);

  if (!microsoftTokens) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <p>Microsoft 계정을 연동하면 할일이 표시됩니다.</p>
          <a href="/settings/" className={styles.linkBtn}>설정으로 이동</a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>할일</h1>
        <button
          className={styles.refreshBtn}
          onClick={() => loadTodos(true)}
          disabled={isLoading}
          title="새로고침"
        >
          <IconRefresh />
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {isLoading && <p className={styles.loading}>불러오는 중...</p>}

      {!isLoading && todos.length === 0 && !error && (
        <p className={styles.empty}>미완료 할일이 없습니다.</p>
      )}

      <div className={styles.lists}>
        {grouped.map(({ listName, items }) => (
          <section key={listName} className={styles.listSection}>
            <h2 className={styles.listName}>{listName}</h2>
            <ul className={styles.todoList}>
              {items.map((todo) => {
                const due = todo.dueDateTime
                  ? formatDue(todo.dueDateTime.dateTime, todo.dueDateTime.timeZone)
                  : null;
                return (
                  <li key={todo.id} className={styles.todoItem}>
                    <button
                      className={styles.checkBtn}
                      onClick={() => handleComplete(todo)}
                      title="완료"
                    />
                    <div className={styles.todoBody}>
                      <p className={styles.todoText}>{todo.title}</p>
                      {due && (
                        <span className={`${styles.due}${due.isPast ? ` ${styles.overdue}` : ""}`}>
                          {due.label}
                        </span>
                      )}
                      {todo.checklistItems && todo.checklistItems.length > 0 && (
                        <ul className={styles.checklistItems}>
                          {todo.checklistItems.map((item) => (
                            <li key={item.id} className={styles.checklistItem}>
                              <button
                                className={`${styles.checklistBtn}${item.isChecked ? ` ${styles.checklistChecked}` : ""}`}
                                onClick={() => handleToggleChecklist(todo, item.id, !item.isChecked)}
                                title={item.isChecked ? "완료 취소" : "완료"}
                              />
                              <span className={`${styles.checklistText}${item.isChecked ? ` ${styles.checklistDone}` : ""}`}>
                                {item.displayName}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}