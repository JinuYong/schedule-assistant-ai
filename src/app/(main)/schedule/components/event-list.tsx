import { memo } from "react";
import { CalendarEvent } from "@/store/events";
import { formatTime } from "@/lib/date-utils";
import { IconPencil, IconClose } from "@/components/icons";
import styles from "../page.module.css";

interface EventListProps {
  isLoading: boolean;
  events: CalendarEvent[];
  deletingId: string | null;
  onEventClick: (ev: CalendarEvent) => void;
  onEdit: (ev: CalendarEvent) => void;
  onDelete: (ev: CalendarEvent) => void;
}

function EventList({
  isLoading, events, deletingId, onEventClick, onEdit, onDelete,
}: EventListProps) {
  return (
    <ul className={styles.eventList}>
      {events.length === 0 ? (
        isLoading ? (<p className={styles.empty}>loading...</p>) : (<p className={styles.empty}>일정이 없습니다.</p>)
      ) : events.map((ev) => (
          <li
            key={ev.id}
            className={styles.eventItem}
            style={ev.calendarColor ? {borderLeftColor: ev.calendarColor} : undefined}
            onClick={() => onEventClick(ev)}
          >
          <span className={styles.eventTime} style={ev.calendarColor ? {color: ev.calendarColor} : undefined}>
            {ev.isAllDay ? "종일" : formatTime(ev.startTime)}
          </span>
            <div className={styles.eventBody}>
              <p className={styles.eventTitle}>{ev.title}</p>
              {ev.location && <p className={styles.eventMeta}>📍 {ev.location}</p>}
            </div>
            <button className={styles.editBtn} onClick={(e) => {
              e.stopPropagation();
              onEdit(ev);
            }} title="일정 수정"><IconPencil/></button>
            <button className={styles.deleteBtn} onClick={(e) => {
              e.stopPropagation();
              onDelete(ev);
            }} disabled={deletingId === ev.id} title="일정 삭제">
              {deletingId === ev.id ? "..." : <IconClose/>}
            </button>
          </li>
        ))}
    </ul>
  );
}

export default memo(EventList);
