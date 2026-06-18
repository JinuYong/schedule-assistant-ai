import { CalendarEvent } from "@/store/events";
import { CalendarListItem } from "@/lib/google-calendar";
import { IconClose } from "@/components/icons";
import styles from "../page.module.css";

interface EventDetailModalProps {
  event: CalendarEvent;
  calendars: CalendarListItem[];
  deletingId: string | null;
  onClose: () => void;
  onDelete: (ev: CalendarEvent) => void;
  onEdit: (ev: CalendarEvent) => void;
}

export default function EventDetailModal({
  event, calendars, deletingId, onClose, onDelete, onEdit,
}: EventDetailModalProps) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span
            className={styles.detailDot}
            style={event.calendarColor ? {background: event.calendarColor} : undefined}
          />
          <h2 className={styles.modalTitle}>{event.title}</h2>
          <button className={styles.modalClose} onClick={onClose}><IconClose/></button>
        </div>
        <div className={styles.detailBody}>
          <p className={styles.detailRow}>
            <span className={styles.detailIcon}>🕐</span>{event.isAllDay
            ? new Date(event.startTime + "T00:00:00").toLocaleDateString("ko-KR", {
            month: "long",
            day: "numeric",
            weekday: "short"
          }) + " (종일)"
            : (() => {
              const s = new Date(event.startTime);
              const e2 = new Date(event.endTime);
              return `${s.toLocaleDateString("ko-KR", {
                month: "long",
                day: "numeric",
                weekday: "short"
              })} ${s.toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit"
              })} – ${e2.toLocaleTimeString("ko-KR", {hour: "2-digit", minute: "2-digit"})}`;
            })()
          }
          </p>
          {event.location && (
            <p className={styles.detailRow}><span className={styles.detailIcon}>📍</span>{event.location}</p>
          )}
          <p className={styles.detailRow}>
            <span className={styles.detailIcon}>🗂</span>{calendars.find((c) => c.id === event.calendarId)?.summary ?? "기본 캘린더"}
          </p>
          {event.description && (
            <p className={styles.detailDesc}>{event.description}</p>
          )}
        </div>
        <div className={styles.modalFooter}>
          <button
            className={styles.dangerOutlineBtn}
            onClick={() => onDelete(event)}
            disabled={deletingId === event.id}
          >
            {deletingId === event.id ? "삭제 중..." : "삭제"}
          </button>
          <button
            className={styles.submitBtn}
            onClick={() => onEdit(event)}
          >
            수정
          </button>
        </div>
      </div>
    </div>
  );
}
