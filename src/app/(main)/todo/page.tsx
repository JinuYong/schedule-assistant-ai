"use client";

import { useEffect, useCallback, useMemo, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useTodosStore, TodoItem } from "@/store/todos";
import { TodoTask } from "@/lib/microsoft-todo";
import styles from "./page.module.css";
import { formatDue } from "@/lib/date-utils";

/* ── 아이콘 ── */
function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6" />
      <path d="M21 13a9 9 0 1 1-3-7.7L21 8" />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round"
         className={ `${ styles.chevron }${ open ? ` ${ styles.chevronOpen }` : "" }` }>
      <path d="M2 4l4 4 4-4" />
    </svg>
  );
}

function IconStar({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
         fill={ filled ? "currentColor" : "none" } stroke="currentColor"
         className={ filled ? styles.iconStarFilled : styles.iconStar }>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function IconRepeat() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className={ styles.iconRepeat }>
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 1.5l2 2L4 11H2V9l7.5-7.5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round">
      <path d="M5.5 1v9M1 5.5h9" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round">
      <path d="M1 1l9 9M10 1L1 10" />
    </svg>
  );
}

/* ── 생성/수정 모달 ── */
interface FormState {
  open: boolean;
  mode: "create" | "edit";
  listId: string;
  taskId?: string;
  title: string;
  dueDate: string;
  importance: "normal" | "high";
  memo: string;
}

const EMPTY_FORM: FormState = {
  open: false, mode: "create", listId: "", taskId: undefined,
  title: "", dueDate: "", importance: "normal", memo: "",
};

export default function TodoPage() {
  const { microsoftTokens } = useAuthStore();
  const {
    todos, isLoading, error, fetchTodos, createTodo, updateTodo, deleteTodo,
    completeTodo, toggleImportance, toggleChecklistItem
  } = useTodosStore();
  const [ expanded, setExpanded ] = useState<Set<string>>(new Set());
  const [ form, setForm ] = useState<FormState>(EMPTY_FORM);
  const [ submitting, setSubmitting ] = useState(false);

  const loadTodos = useCallback(async (force = false) => {
    if (!microsoftTokens?.access_token) return;
    await fetchTodos(microsoftTokens.access_token, force);
  }, [ microsoftTokens, fetchTodos ]);

  useEffect(() => {
    if (!microsoftTokens?.access_token) return;
    fetchTodos(microsoftTokens.access_token);
  }, [ microsoftTokens?.access_token ]); // eslint-disable-line

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleComplete = useCallback(async (todo: TodoItem) => {
    if (!microsoftTokens?.access_token) return;
    await completeTodo(microsoftTokens.access_token, todo.listId, todo.id);
  }, [ microsoftTokens, completeTodo ]);

  const handleToggleImportance = useCallback(async (e: React.MouseEvent, todo: TodoItem) => {
    e.stopPropagation();
    if (!microsoftTokens?.access_token) return;
    await toggleImportance(microsoftTokens.access_token, todo.listId, todo.id, todo.importance);
  }, [ microsoftTokens, toggleImportance ]);

  const handleDelete = useCallback(async (e: React.MouseEvent, todo: TodoItem) => {
    e.stopPropagation();
    if (!microsoftTokens?.access_token) return;
    await deleteTodo(microsoftTokens.access_token, todo.listId, todo.id);
  }, [ microsoftTokens, deleteTodo ]);

  const handleToggleChecklist = useCallback(async (todo: TodoItem, itemId: string, isChecked: boolean) => {
    if (!microsoftTokens?.access_token) return;
    await toggleChecklistItem(microsoftTokens.access_token, todo.listId, todo.id, itemId, isChecked);
  }, [ microsoftTokens, toggleChecklistItem ]);

  const openCreate = useCallback((listId: string) => {
    setForm({ ...EMPTY_FORM, open: true, mode: "create", listId });
  }, []);

  const openEdit = useCallback((e: React.MouseEvent, todo: TodoItem) => {
    e.stopPropagation();
    const dueDate = todo.dueDateTime
      ? todo.dueDateTime.dateTime.split("T")[0]
      : "";
    setForm({
      open: true, mode: "edit", listId: todo.listId, taskId: todo.id,
      title: todo.title,
      dueDate,
      importance: todo.importance === "high" ? "high" : "normal",
      memo: todo.body?.content ?? "",
    });
  }, []);

  const closeForm = useCallback(() => setForm(EMPTY_FORM), []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !microsoftTokens?.access_token) return;
    setSubmitting(true);
    try {
      const dueDateTime = form.dueDate
        ? { dateTime: `${ form.dueDate }T00:00:00.0000000`, timeZone: "UTC" }
        : undefined;
      const task: Partial<TodoTask> = {
        title: form.title.trim(),
        importance: form.importance,
        ...(dueDateTime ? { dueDateTime } : {}),
        ...(form.memo.trim() ? { body: { content: form.memo.trim(), contentType: "text" as const } } : {}),
      };
      if (form.mode === "create") {
        await createTodo(microsoftTokens.access_token, form.listId, task as Parameters<typeof createTodo>[2]);
      } else if (form.taskId) {
        await updateTodo(microsoftTokens.access_token, form.listId, form.taskId, task);
      }
      closeForm();
    } finally {
      setSubmitting(false);
    }
  }, [ form, microsoftTokens, createTodo, updateTodo, closeForm ]);

  const grouped = useMemo(() => {
    const map = new Map<string, { listId: string; listName: string; items: TodoItem[] }>();
    for (const todo of todos) {
      if (!map.has(todo.listId)) map.set(todo.listId, { listId: todo.listId, listName: todo.listName, items: [] });
      map.get(todo.listId)!.items.push(todo);
    }
    return Array.from(map.values());
  }, [ todos ]);

  if (!microsoftTokens) {
    return (
      <div className={ styles.container }>
        <div className={ styles.emptyState }>
          <p>Microsoft 계정을 연동하면 할일이 표시됩니다.</p>
          <a href="/settings/" className={ styles.linkBtn }>설정으로 이동</a>
        </div>
      </div>
    );
  }

  return (
    <div className={ styles.container }>
      <div className={ styles.header }>
        <h1 className={ styles.title }>할일</h1>
        <button className={ styles.refreshBtn } onClick={ () => loadTodos(true) } disabled={ isLoading } title="새로고침">
          <IconRefresh />
        </button>
      </div>

      { error && <p className={ styles.error }>{ error }</p> }
      { isLoading && <p className={ styles.loading }>불러오는 중...</p> }
      { !isLoading && todos.length === 0 && !error && <p className={ styles.empty }>미완료 할일이 없습니다.</p> }

      <div className={ styles.lists }>
        { grouped.map(({ listId, listName, items }) => (
          <section key={ listName } className={ styles.listSection }>
            <div className={ styles.listHeader }>
              <h2 className={ styles.listName }>{ listName }</h2>
              <button className={ styles.addBtn } onClick={ () => openCreate(listId) }>
                <IconPlus /> 추가
              </button>
            </div>
            <ul className={ styles.todoList }>
              { items.map((todo: TodoItem) => {
                const due = todo.dueDateTime ? formatDue(todo.dueDateTime.dateTime, todo.dueDateTime.timeZone) : null;
                const hasAccordion = (todo.checklistItems?.length ?? 0) > 0 || !!todo.body?.content?.trim();
                const isOpen = expanded.has(todo.id);
                return (
                  <li key={ todo.id } className={ styles.todoItem }>
                    <div
                      className={ `${ styles.todoRow }${ hasAccordion ? ` ${ styles.todoRowClickable }` : "" }` }
                      onClick={ () => hasAccordion && toggleExpand(todo.id) }
                    >
                      <button className={ styles.checkBtn } onClick={ (e) => {
                        e.stopPropagation();
                        handleComplete(todo);
                      } } title="완료" />
                      <p className={ styles.todoText }>{ todo.title }</p>
                      <div className={ styles.actionBtns }>
                        <button className={ styles.actionBtn } onClick={ (e) => openEdit(e, todo) } title="수정">
                          <IconPencil /></button>
                        <button className={ `${ styles.actionBtn } ${ styles.deleteBtn }` }
                                onClick={ (e) => handleDelete(e, todo) } title="삭제"><IconTrash /></button>
                      </div>
                      { todo.recurrence && <IconRepeat /> }
                      { due && <span
                          className={ `${ styles.due }${ due.isPast ? ` ${ styles.overdue }` : "" }` }>{ due.label }</span> }
                      <button className={ styles.starBtn } onClick={ (e) => handleToggleImportance(e, todo) }
                              title={ todo.importance === "high" ? "즐겨찾기 해제" : "즐겨찾기" }>
                        <IconStar filled={ todo.importance === "high" } />
                      </button>
                      <span className={ styles.chevronSlot }>{ hasAccordion && <IconChevron open={ isOpen } /> }</span>
                    </div>

                    { hasAccordion && isOpen && (
                      <div className={ styles.accordionBody }>
                        { todo.body?.content?.trim() && (
                          todo.body.contentType === "html"
                            ? <div className={ styles.bodyNote }
                                   dangerouslySetInnerHTML={ { __html: todo.body.content } } />
                            : <p className={ styles.bodyNote }>{ todo.body.content }</p>
                        ) }
                        { (todo.checklistItems?.length ?? 0) > 0 && (
                          <ul className={ styles.checklistItems }>
                            { todo.checklistItems!.map((item) => (
                              <li key={ item.id } className={ styles.checklistItem }>
                                <button
                                  className={ `${ styles.checklistBtn }${ item.isChecked ? ` ${ styles.checklistChecked }` : "" }` }
                                  onClick={ () => handleToggleChecklist(todo, item.id, !item.isChecked) }
                                  title={ item.isChecked ? "완료 취소" : "완료" }
                                />
                                <span
                                  className={ `${ styles.checklistText }${ item.isChecked ? ` ${ styles.checklistDone }` : "" }` }>{ item.displayName }</span>
                              </li>
                            )) }
                          </ul>
                        ) }
                      </div>
                    ) }
                  </li>
                );
              }) }
            </ul>
          </section>
        )) }
      </div>

      {/* 생성/수정 모달 */ }
      { form.open && (
        <div className={ styles.modalOverlay } onClick={ closeForm }>
          <div className={ styles.modal } onClick={ (e) => e.stopPropagation() }>
            <div className={ styles.modalHeader }>
              <h2 className={ styles.modalTitle }>{ form.mode === "create" ? "할일 추가" : "할일 수정" }</h2>
              <button className={ styles.modalClose } onClick={ closeForm }><IconClose /></button>
            </div>
            <form onSubmit={ handleSubmit }>
              <div className={ styles.formGroup }>
                <label className={ styles.formLabel }>제목</label>
                <input
                  className={ styles.formInput }
                  value={ form.title }
                  onChange={ (e) => setForm((f) => ({ ...f, title: e.target.value })) }
                  placeholder="할일 제목"
                  autoFocus
                />
              </div>
              <div className={ styles.formGroup }>
                <label className={ styles.formLabel }>마감일</label>
                <input
                  className={ styles.formInput }
                  type="date"
                  value={ form.dueDate }
                  onChange={ (e) => setForm((f) => ({ ...f, dueDate: e.target.value })) }
                />
              </div>
              <div className={ styles.formGroup }>
                <label className={ styles.formLabel }>메모</label>
                <textarea
                  className={ `${ styles.formInput } ${ styles.formTextarea }` }
                  value={ form.memo }
                  onChange={ (e) => setForm((f) => ({ ...f, memo: e.target.value })) }
                  placeholder="메모 (선택)"
                  rows={ 3 }
                />
              </div>
              <div className={ styles.formImportance }>
                <button
                  type="button"
                  className={ `${ styles.importanceBtn }${ form.importance === "high" ? ` ${ styles.importanceBtnActive }` : "" }` }
                  onClick={ () => setForm((f) => ({ ...f, importance: f.importance === "high" ? "normal" : "high" })) }
                >
                  <IconStar filled={ form.importance === "high" } />
                  { form.importance === "high" ? "즐겨찾기 해제" : "즐겨찾기" }
                </button>
              </div>
              <div className={ styles.modalFooter }>
                <button type="button" className={ styles.cancelBtn } onClick={ closeForm }>취소</button>
                <button type="submit" className={ styles.submitBtn } disabled={ !form.title.trim() || submitting }>
                  { submitting ? "저장 중..." : form.mode === "create" ? "추가" : "저장" }
                </button>
              </div>
            </form>
          </div>
        </div>
      ) }
    </div>
  );
}