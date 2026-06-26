import { memo } from "react";
import { TodoItem } from "@/store/todos";
import { sortChecklistByDone } from "@/lib/todo-form";
import { formatDue } from "@/lib/date-utils";
import { IconPencil, IconTrash, IconStar, IconRepeat, IconChevron } from "@/components/icons";
import styles from "../page.module.css";

export interface TodoGroup {
  listId: string;
  listName: string;
  items: TodoItem[];
}

interface TodoGroupsProps {
  groups: TodoGroup[];
  emptyMessage: string;
  todosError: string | null;
  todosLoading: boolean;
  expandedTodos: Set<string>;
  onToggleExpand: (id: string) => void;
  onComplete: (todo: TodoItem) => void;
  onEditTodo: (e: React.MouseEvent, todo: TodoItem) => void;
  onDeleteTodo: (e: React.MouseEvent, todo: TodoItem) => void;
  onToggleImportance: (e: React.MouseEvent, todo: TodoItem) => void;
  onToggleChecklist: (todo: TodoItem, itemId: string, isChecked: boolean) => void;
}

function TodoGroups({
  groups, emptyMessage, todosError, todosLoading, expandedTodos,
  onToggleExpand, onComplete, onEditTodo, onDeleteTodo, onToggleImportance, onToggleChecklist,
}: TodoGroupsProps) {
  return (
    <>
      {todosError && <p className={styles.error}>{todosError}</p>}
      {todosLoading && <p className={styles.empty}>불러오는 중...</p>}
      {!todosLoading && groups.length === 0 && <p className={styles.empty}>{emptyMessage}</p>}
      <div className={styles.todoGroups}>
        {groups.map(({listId, listName, items}) => (
          <section key={listId} className={styles.todoGroup}>
            <div className={styles.todoGroupHeader}>
              <h3 className={styles.todoGroupName}>{listName}</h3>
            </div>
            <ul className={styles.todoAccordionList}>
              {items.map((todo) => {
                const due = todo.dueDateTime ? formatDue(todo.dueDateTime.dateTime, todo.dueDateTime.timeZone) : null;
                const hasAccordion = (todo.checklistItems?.length ?? 0) > 0 || !!todo.body?.content?.trim();
                const isOpen = expandedTodos.has(todo.id);
                return (
                  <li key={todo.id} className={styles.todoAccordionItem}>
                    <div
                      className={`${styles.todoAccordionRow}${hasAccordion ? ` ${styles.todoAccordionRowClickable}` : ""}`}
                      onClick={() => hasAccordion && onToggleExpand(todo.id)}
                    >
                      <button className={styles.todoCheckBtn} onClick={(e) => {
                        e.stopPropagation();
                        onComplete(todo);
                      }} title="완료"/>
                      <div className={styles.todoAccordionMain}>
                        <div className={styles.todoAccordionTopLine}>
                          <p className={styles.todoAccordionText}>{todo.title}</p>
                          <div className={styles.todoRightControls}>
                            <div className={styles.todoActionBtns}>
                              <button className={styles.todoActionBtn} onClick={(e) => onEditTodo(e, todo)} title="수정">
                                <IconPencil/>
                              </button>
                              <button className={`${styles.todoActionBtn} ${styles.todoDeleteBtn}`}
                                      onClick={(e) => onDeleteTodo(e, todo)} title="삭제">
                                <IconTrash/>
                              </button>
                            </div>
                            {todo.recurrence && <IconRepeat/>}
                            <button className={styles.todoStarBtn} onClick={(e) => onToggleImportance(e, todo)}
                                    title={todo.importance === "high" ? "즐겨찾기 해제" : "즐겨찾기"}>
                              <IconStar filled={todo.importance === "high"}/>
                            </button>
                            <span className={styles.todoChevronSlot}>{hasAccordion && <IconChevron open={isOpen}/>}</span>
                          </div>
                        </div>
                        <div className={styles.todoAccordionMeta}>
                          {due && <span className={`${styles.todoDue}${due.isPast ? ` ${styles.todoDueOverdue}` : ""}`}>{due.label}</span>}
                        </div>
                      </div>
                    </div>
                    {hasAccordion && isOpen && (
                      <div className={styles.todoAccordionBody}>
                        {todo.body?.content?.trim() && (
                          todo.body.contentType === "html"
                            ? <div className={styles.todoBodyNote} dangerouslySetInnerHTML={{__html: todo.body.content}}/>
                            : <p className={styles.todoBodyNote}>{todo.body.content}</p>
                        )}
                        {(todo.checklistItems?.length ?? 0) > 0 && (
                          <ul className={styles.todoChecklistItems}>
                            {sortChecklistByDone(todo.checklistItems!).map((item) => (
                              <li key={item.id} className={styles.todoChecklistItem}>
                                <button
                                  className={`${styles.todoChecklistBtn}${item.isChecked ? ` ${styles.todoChecklistChecked}` : ""}`}
                                  onClick={() => onToggleChecklist(todo, item.id, !item.isChecked)}
                                  title={item.isChecked ? "완료 취소" : "완료"}
                                />
                                <span className={`${styles.todoChecklistText}${item.isChecked ? ` ${styles.todoChecklistDone}` : ""}`}>
                                  {item.displayName}
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
