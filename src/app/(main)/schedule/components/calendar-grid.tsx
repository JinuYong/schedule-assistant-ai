import { useRef } from "react";
import { CalendarEvent } from "@/store/events";
import { formatTime } from "@/lib/date-utils";
import { IconPlus } from "@/components/icons";
import { CalCell } from "../calendar-utils";
import styles from "../page.module.css";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

interface CalendarGridProps {
  cells: CalCell[];
  todayDate: string;
  selectedDate: string;
  eventsByDate: Map<string, CalendarEvent[]>;
  draggingEvent: CalendarEvent | null;
  dragOverDate: string | null;
  prevMonth: () => void;
  nextMonth: () => void;
  onSelectDate: (date: string) => void;
  onAddEvent: (date: string) => void;
  onEventChipClick: (ev: CalendarEvent, date: string) => void;
  onEventMouseDown: (ev: CalendarEvent, e: React.MouseEvent) => void;
}

export default function CalendarGrid({
  cells, todayDate, selectedDate, eventsByDate, draggingEvent, dragOverDate,
  prevMonth, nextMonth, onSelectDate, onAddEvent, onEventChipClick, onEventMouseDown,
}: CalendarGridProps) {
  const wheelCooldownRef = useRef(false);
  const wheelJustReleasedRef = useRef(false);
  const lastAbsDeltaRef = useRef(0);
  const cooldownStartRef = useRef(0);

  return (
    <div
      className={styles.calendar}
      onWheel={(e) => {
        e.preventDefault();
        const delta = e.deltaX;
        const absDelta = Math.abs(delta);
        // 감속 감지: delta가 이전의 70% 미만 + 최소 100ms 경과 → 스와이프 끝으로 판단, 쿨다운 해제
        if (wheelCooldownRef.current && lastAbsDeltaRef.current > 0 && absDelta < lastAbsDeltaRef.current * 0.7 && Date.now() - cooldownStartRef.current > 100) {
          wheelCooldownRef.current = false;
          wheelJustReleasedRef.current = true;
          lastAbsDeltaRef.current = 0;
          setTimeout(() => { wheelJustReleasedRef.current = false; }, 50);
          return;
        }
        lastAbsDeltaRef.current = absDelta;
        if (absDelta < 30) return;
        if (wheelCooldownRef.current || wheelJustReleasedRef.current) return;
        wheelCooldownRef.current = true;
        cooldownStartRef.current = Date.now();
        lastAbsDeltaRef.current = absDelta;
        if (delta > 0) nextMonth(); else prevMonth();
      }}
    >
      <div className={styles.weekdays}>
        {WEEKDAYS.map((wd, i) => (
          <div key={wd} className={`${styles.weekdayHeader}${i === 6 ? ` ${styles.sundayLabel}` : ""}`}>{wd}</div>
        ))}
      </div>
      <div className={styles.dayCells}>
        {cells.map(({date, day, inMonth, isSunday}) => {
          const isToday = date === todayDate;
          const isSelected = date === selectedDate;
          const dayEvs = eventsByDate.get(date) ?? [];
          const shown = dayEvs.slice(0, 3);
          const extra = dayEvs.length - shown.length;
          const cls = [
            styles.dayCell,
            !inMonth ? styles.otherMonth : "",
            isToday ? styles.todayCell : "",
            isSelected ? styles.selectedCell : "",
            isSunday ? styles.sundayCell : "",
          ].filter(Boolean).join(" ");

          const isDragOver = dragOverDate === date;

          return (
            <div
              key={date}
              data-date={date}
              className={`${cls}${isDragOver ? ` ${styles.dragOverCell}` : ""}`}
              onClick={() => {
                if (!draggingEvent) {
                  onSelectDate(date);
                  // openEventForm(date);
                }
              }}
            >
              <span className={styles.dayNumber}>{day}</span>
              {inMonth && (
                <button
                  className={styles.cellAddBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddEvent(date);
                  }}
                  title="일정 추가"
                >
                  <IconPlus/>
                </button>
              )}
              {shown.map((ev) => (
                <span
                  key={ev.id}
                  className={`${styles.eventChip}${draggingEvent?.id === ev.id ? ` ${styles.draggingChip}` : ""}`}
                  style={ev.calendarColor ? {background: ev.description === "공휴일" ? "#c44343" : ev.calendarColor, color: "#fff"} : undefined}
                  onClick={(e) => { e.stopPropagation(); onEventChipClick(ev, date); }}
                  onMouseDown={(e) => onEventMouseDown(ev, e)}
                >
                {ev.isAllDay ? "" : `${formatTime(ev.startTime)} `}{ev.title}
              </span>
              ))}
              {extra > 0 && <span className={styles.moreEvents}>+{extra}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
