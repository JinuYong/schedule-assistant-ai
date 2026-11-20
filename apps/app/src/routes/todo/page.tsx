import { useEffect, useCallback, useMemo, useState } from "react";
import type { Todo } from "@cali/shared";
import { useTodosStore } from "@/store/todos";
import { useTodoActions } from "@/hooks/use-todo-actions";
import {
  EMPTY_TODO_FORM,
  todoEditFormState,
  buildTodoBody,
  repeatLabel,
  sortChecklistByDone,
  type TodoFormState,
} from "@/lib/todo-form";
import TodoFormModal from "@/routes/schedule/components/todo-form-modal";
import { formatDue } from "@/lib/date-utils";
import {
  IconRefresh,
  IconChevron,
  IconStar,
  IconRepeat,
  IconPencil,
  IconTrash,
  IconPlus,
} from "@/components/icons";
import ListHeader from "./components/list-header";
import ListNameInput from "./components/list-name-input";
import CompletedTodos from "./components/completed-todos";
import styles from "./page.module.css";

export default function TodoPage() {
  const lists = useTodosStore((s) => s.lists);
  const todos = useTodosStore((s) => s.todos);
  const completed = useTodosStore((s) => s.completed);
  const isLoading = useTodosStore((s) => s.isLoading);
  const error = useTodosStore((s) => s.error);
  const fetchTodos = useTodosStore((s) => s.fetchTodos);
  const fetchCompleted = useTodosStore((s) => s.fetchCompleted);
  const createTodo = useTodosStore((s) => s.createTodo);
  const updateTodo = useTodosStore((s) => s.updateTodo);
  const createList = useTodosStore((s) => s.createList);
  const todoActions = useTodoActions();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<TodoFormState>(EMPTY_TODO_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [addingList, setAddingList] = useState(false);

  const load = useCallback(
    () => Promise.all([fetchTodos(), fetchCompleted()]),
    [fetchTodos, fetchCompleted],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openCreate = useCallback((listId: number) => {
    setForm({ ...EMPTY_TODO_FORM, open: true, mode: "create", listId });
  }, []);

  const openEdit = useCallback((e: React.MouseEvent, todo: Todo) => {
    e.stopPropagation();
    setForm(todoEditFormState(todo));
  }, []);

  const closeForm = useCallback(() => setForm(EMPTY_TODO_FORM), []);

  const handleSubmit = useCallback(
    async (e: { preventDefault(): void }) => {
      e.preventDefault();
      if (!form.title.trim() || !form.listId) return;
      setSubmitting(true);
      try {
        const body = buildTodoBody(form);
        const ok =
          form.mode === "create"
            ? await createTodo(body)
            : !!form.taskId && (await updateTodo(form.taskId, body));
        if (ok) closeForm();
      } finally {
        setSubmitting(false);
      }
    },
    [form, createTodo, updateTodo, closeForm],
  );

  // 목록은 할일이 없어도 늘 보인다(추가 버튼 자리). 각 목록에 미완료·완료 할일을 나눠 담는다
  const grouped = useMemo(
    () =>
      lists.map((list) => ({
        list,
        items: todos.filter((t) => t.listId === list.id),
        done: completed.filter((t) => t.listId === list.id),
      })),
    [lists, todos, completed],
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>할일</h1>
        <div className={styles.refreshGroup}>
          {isLoading && <span className={styles.loadingDot} />}
          <button
            className={styles.addBtn}
            onClick={() => setAddingList(true)}
            disabled={addingList}
          >
            <IconPlus size={11} /> 목록
          </button>
          <button
            className={styles.refreshBtn}
            onClick={() => void load()}
            disabled={isLoading}
            title="새로고침"
          >
            <IconRefresh />
          </button>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {isLoading && grouped.length === 0 && (
        <p className={styles.loading}>불러오는 중...</p>
      )}

      <div className={styles.lists}>
        {grouped.map(({ list, items, done }) => (
          <section key={list.id} className={styles.listSection}>
            <ListHeader
              list={list}
              count={items.length}
              canDelete={lists.length > 1}
              onAdd={() => openCreate(list.id)}
            />
            {items.length === 0 && (
              <p className={styles.listEmpty}>미완료 할일이 없습니다.</p>
            )}
            <ul className={styles.todoList}>
              {items.map((todo) => {
                const due = todo.dueDate ? formatDue(todo.dueDate) : null;
                const hasAccordion =
                  todo.checklist.length > 0 || !!todo.memo.trim();
                const isOpen = expanded.has(todo.id);
                return (
                  <li key={todo.id} className={styles.todoItem}>
                    <div
                      className={`${styles.todoRow}${hasAccordion ? ` ${styles.todoRowClickable}` : ""}`}
                      onClick={() => hasAccordion && toggleExpand(todo.id)}
                    >
                      <button
                        className={styles.checkBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          void todoActions.complete(todo);
                        }}
                        title="완료"
                      />
                      <p className={styles.todoText}>{todo.title}</p>
                      <div className={styles.actionBtns}>
                        <button
                          className={styles.actionBtn}
                          onClick={(e) => openEdit(e, todo)}
                          title="수정"
                        >
                          <IconPencil />
                        </button>
                        <button
                          className={`${styles.actionBtn} ${styles.deleteBtn}`}
                          onClick={(e) => void todoActions.remove(e, todo)}
                          title="삭제"
                        >
                          <IconTrash />
                        </button>
                      </div>
                      {todo.repeat && (
                        <span title={repeatLabel(todo.repeat)}>
                          <IconRepeat />
                        </span>
                      )}
                      {due && (
                        <span
                          className={`${styles.due}${due.isPast ? ` ${styles.overdue}` : ""}`}
                        >
                          {due.label}
                        </span>
                      )}
                      <button
                        className={styles.starBtn}
                        onClick={(e) =>
                          void todoActions.toggleImportance(e, todo)
                        }
                        title={
                          todo.importance === "high"
                            ? "즐겨찾기 해제"
                            : "즐겨찾기"
                        }
                      >
                        <IconStar filled={todo.importance === "high"} />
                      </button>
                      <span className={styles.chevronSlot}>
                        {hasAccordion && <IconChevron open={isOpen} />}
                      </span>
                    </div>

                    {hasAccordion && isOpen && (
                      <div className={styles.accordionBody}>
                        {todo.memo.trim() && (
                          <p className={styles.bodyNote}>{todo.memo}</p>
                        )}
                        {todo.checklist.length > 0 && (
                          <ul className={styles.checklistItems}>
                            {sortChecklistByDone(todo.checklist).map((item) => (
                              <li
                                key={item.id}
                                className={styles.checklistItem}
                              >
                                <button
                                  className={`${styles.checklistBtn}${item.checkedAt ? ` ${styles.checklistChecked}` : ""}`}
                                  onClick={() =>
                                    void todoActions.toggleChecklist(
                                      todo,
                                      item.id,
                                      !item.checkedAt,
                                    )
                                  }
                                  title={item.checkedAt ? "완료 취소" : "완료"}
                                />
                                <span
                                  className={`${styles.checklistText}${item.checkedAt ? ` ${styles.checklistDone}` : ""}`}
                                >
                                  {item.title}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <CompletedTodos items={done} />
          </section>
        ))}

        {addingList && (
          <section className={styles.listSection}>
            <div className={styles.listHeader}>
              <ListNameInput
                placeholder="새 목록 이름"
                onSave={createList}
                onCancel={() => setAddingList(false)}
              />
            </div>
          </section>
        )}
      </div>

      {/* 생성/수정 모달 (공유) */}
      {form.open && (
        <TodoFormModal
          form={form}
          setForm={setForm}
          todoLists={lists}
          submitting={submitting}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
