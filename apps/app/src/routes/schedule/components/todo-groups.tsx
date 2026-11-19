import { memo } from "react";
import type { Todo } from "@cali/shared";
import { sortChecklistByDone, repeatLabel } from "@/lib/todo-form";
import { formatDue, formatDateTimeLabel } from "@/lib/date-utils";
import {
  IconPencil,
  IconTrash,
  IconStar,
  IconRepeat,
  IconBell,
  IconChevron,
} from "@/components/icons";
import styles from "../page.module.css";

export interface TodoGroup {
  listId: number;
  listName: string;
  items: Todo[];
}

interface TodoGroupsProps {
  groups: TodoGroup[];
  emptyMessage: string;
  todosError: string | null;
  todosLoading: boolean;
  expandedTodos: Set<number>;
  onToggleExpand: (id: number) => void;
  onComplete: (todo: Todo) => void;
  onEditTodo: (e: React.MouseEvent, todo: Todo) => void;
  onDeleteTodo: (e: React.MouseEvent, todo: Todo) => void;
  onToggleImportance: (e: React.MouseEvent, todo: Todo) => void;
  onToggleChecklist: (todo: Todo, itemId: number, checked: boolean) => void;
}

function TodoGroups({
  groups,
  emptyMessage,
  todosError,
  todosLoading,
  expandedTodos,
  onToggleExpand,
  onComplete,
  onEditTodo,
  onDeleteTodo,
  onToggleImportance,
  onToggleChecklist,
}: TodoGroupsProps) {
  return (
    <>
      {todosError && <p className={styles.error}>{todosError}</p>}
      {todosLoading && <p className={styles.empty}>불러오는 중...</p>}
      {!todosLoading && groups.length === 0 && (
        <p className={styles.empty}>{emptyMessage}</p>
      )}
      <div className={styles.todoGroups}>
        {groups.map(({ listId, listName, items }) => (
          <section key={listId} className={styles.todoGroup}>
            <div className={styles.todoGroupHeader}>
              <h3 className={styles.todoGroupName}>{listName}</h3>
            </div>
            <ul className={styles.todoAccordionList}>
              {items.map((todo) => {
                const due = todo.dueDate ? formatDue(todo.dueDate) : null;
                const hasAccordion =
                  todo.checklist.length > 0 ||
                  !!todo.memo.trim() ||
                  !!todo.reminderAt ||
                  !!todo.repeat;
                const isOpen = expandedTodos.has(todo.id);
                return (
                  <li key={todo.id} className={styles.todoAccordionItem}>
                    <div
                      className={`${styles.todoAccordionRow}${hasAccordion ? ` ${styles.todoAccordionRowClickable}` : ""}`}
                      onClick={() => hasAccordion && onToggleExpand(todo.id)}
                    >
                      <button
                        className={styles.todoCheckBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          onComplete(todo);
                        }}
                        title="완료"
                      />
                      <div className={styles.todoAccordionMain}>
                        <div className={styles.todoAccordionTopLine}>
                          <p className={styles.todoAccordionText}>
                            {todo.title}
                          </p>
                          <div className={styles.todoRightControls}>
                            <div className={styles.todoActionBtns}>
                              <button
                                className={styles.todoActionBtn}
                                onClick={(e) => onEditTodo(e, todo)}
                                title="수정"
                              >
                                <IconPencil />
                              </button>
                              <button
                                className={`${styles.todoActionBtn} ${styles.todoDeleteBtn}`}
                                onClick={(e) => onDeleteTodo(e, todo)}
                                title="삭제"
                              >
                                <IconTrash />
                              </button>
                            </div>
                            {todo.repeat && <IconRepeat />}
                            <button
                              className={styles.todoStarBtn}
                              onClick={(e) => onToggleImportance(e, todo)}
                              title={
                                todo.importance === "high"
                                  ? "즐겨찾기 해제"
                                  : "즐겨찾기"
                              }
                            >
                              <IconStar filled={todo.importance === "high"} />
                            </button>
                            <span className={styles.todoChevronSlot}>
                              {hasAccordion && <IconChevron open={isOpen} />}
                            </span>
                          </div>
                        </div>
                        <div className={styles.todoAccordionMeta}>
                          {due && (
                            <span
                              className={`${styles.todoDue}${due.isPast ? ` ${styles.todoDueOverdue}` : ""}`}
                            >
                              {due.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {hasAccordion && isOpen && (
                      <div className={styles.todoAccordionBody}>
                        {(todo.reminderAt || todo.repeat) && (
                          <div className={styles.todoDetailRows}>
                            {todo.reminderAt && (
                              <span className={styles.todoDetailRow}>
                                <IconBell />
                                {formatDateTimeLabel(
                                  Date.parse(todo.reminderAt),
                                )}
                              </span>
                            )}
                            {todo.repeat && (
                              <span className={styles.todoDetailRow}>
                                <IconRepeat />
                                {repeatLabel(todo.repeat)} 반복
                              </span>
                            )}
                          </div>
                        )}
                        {todo.memo.trim() && (
                          <p className={styles.todoBodyNote}>{todo.memo}</p>
                        )}
                        {todo.checklist.length > 0 && (
                          <ul className={styles.todoChecklistItems}>
                            {sortChecklistByDone(todo.checklist).map((item) => (
                              <li
                                key={item.id}
                                className={styles.todoChecklistItem}
                              >
                                <button
                                  className={`${styles.todoChecklistBtn}${item.checkedAt ? ` ${styles.todoChecklistChecked}` : ""}`}
                                  onClick={() =>
                                    onToggleChecklist(
                                      todo,
                                      item.id,
                                      !item.checkedAt,
                                    )
                                  }
                                  title={item.checkedAt ? "완료 취소" : "완료"}
                                />
                                <span
                                  className={`${styles.todoChecklistText}${item.checkedAt ? ` ${styles.todoChecklistDone}` : ""}`}
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
          </section>
        ))}
      </div>
    </>
  );
}

export default memo(TodoGroups);
