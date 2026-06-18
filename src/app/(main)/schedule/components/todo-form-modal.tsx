import { Dispatch, SetStateAction } from "react";
import { IconClose, IconStar, IconRepeat, IconBell, IconPlus } from "@/components/icons";
import { TodoFormState, recurrenceLabel } from "../calendar-utils";
import styles from "../page.module.css";

interface TodoFormModalProps {
  form: TodoFormState;
  setForm: Dispatch<SetStateAction<TodoFormState>>;
  todoLists: { id: string; name: string }[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (e: { preventDefault(): void }) => void;
}

export default function TodoFormModal({ form, setForm, todoLists, submitting, onClose, onSubmit }: TodoFormModalProps) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{form.mode === "create" ? "할일 추가" : "할일 수정"}</h2>
          <button className={styles.modalClose} onClick={onClose}><IconClose/></button>
        </div>
        <form onSubmit={onSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>제목</label>
            <div className={styles.todoTitleInputRow}>
              <input
                className={styles.formInput}
                value={form.title}
                onChange={(e) => setForm((f) => ({...f, title: e.target.value}))}
                placeholder="할일 제목"
                autoFocus
              />
              <button
                type="button"
                className={`${styles.todoModalIconBtn} ${styles.todoModalStarBtn}${form.importance === "high" ? ` ${styles.todoModalIconBtnActive}` : ""}`}
                onClick={() => setForm((f) => ({...f, importance: f.importance === "high" ? "normal" : "high"}))}
                title={form.importance === "high" ? "즐겨찾기 해제" : "즐겨찾기"}
              >
                <IconStar filled={form.importance === "high"}/>
              </button>
            </div>
          </div>
          {todoLists.length > 1 && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>목록</label>
              <select
                className={styles.formInput}
                value={form.listId}
                onChange={(e) => setForm((f) => ({...f, listId: e.target.value}))}
              >
                {todoLists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>마감일</label>
            <div className={styles.todoDueInputRow}>
              <input
                className={styles.formInput}
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({...f, dueDate: e.target.value}))}
              />
              <button
                type="button"
                className={`${styles.todoModalIconBtn}${form.repeatEnabled ? ` ${styles.todoModalIconBtnActive}` : ""}`}
                onClick={() => setForm((f) => ({...f, repeatEnabled: !f.repeatEnabled}))}
                title={form.repeatEnabled ? "반복 해제" : "반복"}
              >
                <IconRepeat/>
              </button>
              <button
                type="button"
                className={`${styles.todoModalIconBtn}${form.reminderEnabled ? ` ${styles.todoModalIconBtnActive}` : ""}`}
                onClick={() => setForm((f) => ({
                  ...f,
                  reminderEnabled: !f.reminderEnabled,
                  reminderDate: !f.reminderEnabled && !f.reminderDate
                    ? (f.dueDate || new Date().toISOString().split("T")[0])
                    : f.reminderDate,
                }))}
                title={form.reminderEnabled ? "알림 해제" : "알림"}
              >
                <IconBell/>
              </button>
            </div>
          </div>
          {form.reminderEnabled && (
            <div className={styles.repeatPanel}>
              <label className={styles.formLabel}>알림</label>
              <div className={styles.repeatControls}>
                <input
                  className={styles.formInput}
                  type="date"
                  value={form.reminderDate}
                  onChange={(e) => setForm((f) => ({...f, reminderDate: e.target.value}))}
                />
                <input
                  className={styles.formInput}
                  type="time"
                  value={form.reminderTime}
                  onChange={(e) => setForm((f) => ({...f, reminderTime: e.target.value}))}
                />
              </div>
            </div>
          )}
          {form.repeatEnabled && (
            <div className={styles.repeatPanel}>
              <label className={styles.formLabel}>반복</label>
              <div className={styles.repeatControls}>
                <select
                  className={styles.formInput}
                  value={form.repeatType}
                  onChange={(e) => setForm((f) => ({...f, repeatType: e.target.value as TodoFormState["repeatType"]}))}
                >
                  <option value="daily">매일</option>
                  <option value="weekly">매주</option>
                  <option value="absoluteMonthly">매월</option>
                  <option value="absoluteYearly">매년</option>
                </select>
                <div className={styles.repeatIntervalControl}>
                  <input
                    className={styles.formInput}
                    type="number"
                    min={1}
                    max={99}
                    value={form.repeatInterval}
                    onChange={(e) => setForm((f) => ({...f, repeatInterval: Math.max(1, Number(e.target.value) || 1)}))}
                  />
                  <span>{recurrenceLabel(form.repeatType)}</span>
                </div>
              </div>
            </div>
          )}
          <div className={styles.formGroup}>
            <div className={styles.checklistHeader}>
              <label className={styles.formLabel}>체크리스트</label>
              <button
                type="button"
                className={styles.checklistAddBtn}
                onClick={() => setForm((f) => ({
                  ...f,
                  checklistItems: [...f.checklistItems, {displayName: "", isChecked: false}],
                }))}
              >
                <IconPlus/> 항목 추가
              </button>
            </div>
            {form.checklistItems.length > 0 && (
              <ul className={styles.checklistEditor}>
                {form.checklistItems.map((item, index) => (
                  <li key={item.id ?? index} className={styles.checklistEditorItem}>
                    <button
                      type="button"
                      className={`${styles.todoChecklistBtn}${item.isChecked ? ` ${styles.todoChecklistChecked}` : ""}`}
                      onClick={() => setForm((f) => ({
                        ...f,
                        checklistItems: f.checklistItems.map((current, i) =>
                          i === index ? {...current, isChecked: !current.isChecked} : current
                        ),
                      }))}
                      title={item.isChecked ? "완료 취소" : "완료"}
                    />
                    <input
                      className={styles.checklistEditorInput}
                      value={item.displayName}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        checklistItems: f.checklistItems.map((current, i) =>
                          i === index ? {...current, displayName: e.target.value} : current
                        ),
                      }))}
                      placeholder="체크리스트 항목"
                    />
                    <button
                      type="button"
                      className={styles.checklistRemoveBtn}
                      onClick={() => setForm((f) => ({
                        ...f,
                        checklistItems: f.checklistItems.filter((_, i) => i !== index),
                      }))}
                      title="항목 삭제"
                    >
                      <IconClose/>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>메모</label>
            <textarea
              className={`${styles.formInput} ${styles.formTextarea}`}
              value={form.memo}
              onChange={(e) => setForm((f) => ({...f, memo: e.target.value}))}
              placeholder="메모 (선택)"
              rows={3}
            />
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>취소</button>
            <button type="submit" className={styles.submitBtn}
                    disabled={!form.title.trim() || submitting}>
              {submitting ? "저장 중..." : form.mode === "create" ? "추가" : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
