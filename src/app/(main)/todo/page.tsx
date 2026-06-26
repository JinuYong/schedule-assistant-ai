"use client";

import { useEffect, useCallback, useMemo, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useTodosStore, TodoItem } from "@/store/todos";
import { useTodoActions } from "@/hooks/use-todo-actions";
import {
  EMPTY_TODO_FORM, todoEditFormState, buildTodoTaskFromForm, sortChecklistByDone, type TodoFormState,
} from "@/lib/todo-form";
import TodoFormModal from "@/app/(main)/schedule/components/todo-form-modal";
import styles from "./page.module.css";
import { formatDue } from "@/lib/date-utils";
import UnavailableContent from '@/components/unavailable-content'
import {
  IconRefresh, IconChevron, IconStar, IconRepeat, IconPencil, IconTrash, IconPlus
} from "@/components/icons";

export default function TodoPage() {
  // 필드별 셀렉터 구독 — 미사용 필드(lastFetchedAt 등) 변경 시 리렌더 방지
  const microsoftTokens = useAuthStore((s) => s.microsoftTokens);
  const todos = useTodosStore((s) => s.todos);
  const taskLists = useTodosStore((s) => s.taskLists);
  const isLoading = useTodosStore((s) => s.isLoading);
  const error = useTodosStore((s) => s.error);
  const fetchTodos = useTodosStore((s) => s.fetchTodos);
  const createTodo = useTodosStore((s) => s.createTodo);
  const updateTodo = useTodosStore((s) => s.updateTodo);
  const [ expanded, setExpanded ] = useState<Set<string>>(new Set());
  const [ form, setForm ] = useState<TodoFormState>(EMPTY_TODO_FORM);
  const [ submitting, setSubmitting ] = useState(false);

  // Microsoft Todo CRUD — 저장된 토큰 직접 사용
  const resolveMicrosoftToken = useCallback(
    async () => microsoftTokens?.access_token ?? null,
    [ microsoftTokens ]
  );
  const todoActions = useTodoActions(resolveMicrosoftToken);

  const loadTodos = useCallback(async (force = false) => {
    if (!microsoftTokens?.access_token) return;
    await fetchTodos(microsoftTokens.access_token, force);
  }, [ microsoftTokens, fetchTodos ]);

  useEffect(() => {
    if (!microsoftTokens?.access_token) return;
    fetchTodos(microsoftTokens.access_token);
  }, [ microsoftTokens?.access_token ]); // eslint-disable-line react-hooks/exhaustive-deps -- 토큰 문자열에만 의존, fetchTodos는 안정적 액션

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const todoLists = useMemo(
    () => taskLists.map((l) => ({ id: l.id, name: l.displayName })),
    [taskLists]
  );

  const openCreate = useCallback((listId: string) => {
    setForm({ ...EMPTY_TODO_FORM, open: true, mode: "create", listId });
  }, []);

  const openEdit = useCallback((e: React.MouseEvent, todo: TodoItem) => {
    e.stopPropagation();
    setForm(todoEditFormState(todo));
  }, []);

  const closeForm = useCallback(() => setForm(EMPTY_TODO_FORM), []);

  const handleSubmit = useCallback(async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!form.title.trim() || !form.listId || !microsoftTokens?.access_token) return;
    setSubmitting(true);
    try {
      const task = buildTodoTaskFromForm(form);
      const checklistItems = form.checklistItems.filter((item) => item.displayName.trim());
      if (form.mode === "create") {
        await createTodo(microsoftTokens.access_token, form.listId, task, checklistItems);
      } else if (form.taskId) {
        await updateTodo(microsoftTokens.access_token, form.listId, form.taskId, task, checklistItems);
      }
      closeForm();
    } finally {
      setSubmitting(false);
    }
  }, [ form, microsoftTokens, createTodo, updateTodo, closeForm ]);

  // 카테고리는 실제 작업 목록(taskLists) 기준으로 항상 표시 → 미완료 할일이 없어도
  // 목록·추가버튼이 사라지지 않게 한다. 각 목록의 미완료 할일만 채운다.
  const grouped = useMemo(() => {
    const itemsByList = new Map<string, TodoItem[]>();
    for (const todo of todos) {
      if (!itemsByList.has(todo.listId)) itemsByList.set(todo.listId, []);
      itemsByList.get(todo.listId)!.push(todo);
    }
    return taskLists.map((l) => ({
      listId: l.id,
      listName: l.displayName,
      items: itemsByList.get(l.id) ?? [],
    }));
  }, [ todos, taskLists ]);

  if (!microsoftTokens) {
    return (
      <div className={ styles.emptyContainer }>
        <UnavailableContent type="MICROSOFT" />
      </div>
    );
  }

  return (
    <div className={ styles.container }>
      <div className={ styles.header }>
        <h1 className={ styles.title }>할일</h1>
        <div className={ styles.refreshGroup }>
          { isLoading && <span className={ styles.loadingDot } /> }
          <button className={ styles.refreshBtn } onClick={ () => loadTodos(true) } disabled={ isLoading } title="새로고침">
            <IconRefresh />
          </button>
        </div>
      </div>

      { error && <p className={ styles.error }>{ error }</p> }
      { isLoading && grouped.length === 0 && <p className={ styles.loading }>불러오는 중...</p> }
      { !isLoading && grouped.length === 0 && !error && <p className={ styles.empty }>작업 목록이 없습니다.</p> }

      <div className={ styles.lists }>
        { grouped.map(({ listId, listName, items }) => (
          <section key={ listId } className={ styles.listSection }>
            <div className={ styles.listHeader }>
              <h2 className={ styles.listName }>{ listName }</h2>
              <button className={ styles.addBtn } onClick={ () => openCreate(listId) }>
                <IconPlus size={ 11 } /> 추가
              </button>
            </div>
            { items.length === 0 && <p className={ styles.empty }>미완료 할일이 없습니다.</p> }
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
                        todoActions.complete(todo);
                      } } title="완료" />
                      <p className={ styles.todoText }>{ todo.title }</p>
                      <div className={ styles.actionBtns }>
                        <button className={ styles.actionBtn } onClick={ (e) => openEdit(e, todo) } title="수정">
                          <IconPencil /></button>
                        <button className={ `${ styles.actionBtn } ${ styles.deleteBtn }` }
                                onClick={ (e) => todoActions.remove(e, todo) } title="삭제"><IconTrash /></button>
                      </div>
                      { todo.recurrence && <IconRepeat /> }
                      { due && <span
                          className={ `${ styles.due }${ due.isPast ? ` ${ styles.overdue }` : "" }` }>{ due.label }</span> }
                      <button className={ styles.starBtn } onClick={ (e) => todoActions.toggleImportance(e, todo) }
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
                            { sortChecklistByDone(todo.checklistItems!).map((item) => (
                              <li key={ item.id } className={ styles.checklistItem }>
                                <button
                                  className={ `${ styles.checklistBtn }${ item.isChecked ? ` ${ styles.checklistChecked }` : "" }` }
                                  onClick={ () => todoActions.toggleChecklist(todo, item.id, !item.isChecked) }
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

      {/* 생성/수정 모달 (공유) */ }
      { form.open && (
        <TodoFormModal
          form={ form }
          setForm={ setForm }
          todoLists={ todoLists }
          submitting={ submitting }
          onClose={ closeForm }
          onSubmit={ handleSubmit }
        />
      ) }
    </div>
  );
}