import { Dispatch, SetStateAction } from "react";
import { CalendarListItem } from "@/lib/google-calendar";
import { IconClose } from "@/components/icons";
import { EventForm } from "../calendar-utils";
import styles from "../page.module.css";

interface EventFormModalProps {
  form: EventForm;
  setForm: Dispatch<SetStateAction<EventForm>>;
  calendars: CalendarListItem[];
  onClose: () => void;
  onSubmit: (e: { preventDefault(): void }) => void;
}

export default function EventFormModal({ form, setForm, calendars, onClose, onSubmit }: EventFormModalProps) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{form.editEventId ? "일정 수정" : "새 일정"}</h2>
          <button className={styles.modalClose} onClick={onClose}><IconClose/></button>
        </div>
        <form onSubmit={onSubmit}>
          <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>제목</label>
            <input
              className={styles.formInput}
              value={form.title}
              onChange={(e) => setForm((f) => ({...f, title: e.target.value}))}
              placeholder="일정 제목"
              autoFocus
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>시작 날짜</label>
              <input
                className={styles.formInput}
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => {
                  const date = e.target.value;
                  // 시작일이 종료일보다 뒤로 가면 종료일도 함께 맞춤
                  return {...f, date, endDate: f.endDate && f.endDate >= date ? f.endDate : date};
                })}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>종료 날짜</label>
              <input
                className={styles.formInput}
                type="date"
                value={form.endDate || form.date}
                min={form.date}
                onChange={(e) => setForm((f) => ({...f, endDate: e.target.value}))}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>캘린더</label>
            <select
              className={styles.formInput}
              value={form.calendarId}
              onChange={(e) => setForm((f) => ({...f, calendarId: e.target.value}))}
            >
              {calendars.length > 0
                ? calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>{cal.summary}</option>
                ))
                : <option value="primary">기본 캘린더</option>
              }
            </select>
          </div>

          <div className={styles.allDayRow}>
            <input
              type="checkbox"
              id="formIsAllDay"
              checked={form.isAllDay}
              onChange={(e) => setForm((f) => ({...f, isAllDay: e.target.checked}))}
            />
            <label htmlFor="formIsAllDay" className={styles.allDayLabel}>종일</label>
          </div>

          {!form.isAllDay && (
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>시작</label>
                <input
                  className={styles.formInput}
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({...f, startTime: e.target.value}))}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>종료</label>
                <input
                  className={styles.formInput}
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({...f, endTime: e.target.value}))}
                />
              </div>
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>장소 (선택)</label>
            <input
              className={styles.formInput}
              value={form.location}
              onChange={(e) => setForm((f) => ({...f, location: e.target.value}))}
              placeholder="장소"
            />
          </div>
          </div>

          <div className={styles.modalFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>취소</button>
            <button type="submit" className={styles.submitBtn}
                    disabled={!form.title.trim() || !form.date || form.submitting}>
              {form.submitting ? "저장 중..." : form.editEventId ? "수정 저장" : "일정 추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
