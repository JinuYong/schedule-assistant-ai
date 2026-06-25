import { memo, useRef } from "react";
import { CalendarEvent } from "@/store/events";
import { formatTime } from "@/lib/date-utils";
import { IconPlus } from "@/components/icons";
import { CalCell, LaneSlot } from "../calendar-utils";
import styles from "../page.module.css";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

interface CalendarGridProps {
  cells: CalCell[];
  todayDate: string;
  selectedDate: string;
  slotsByDate: Map<string, (LaneSlot | null)[]>;
  overflowByDate: Map<string, number>;
  draggingEvent: CalendarEvent | null;
  dragOverDate: string | null;
  prevMonth: () => void;
  nextMonth: () => void;
  onSelectDate: (date: string) => void;
  onAddEvent: (date: string) => void;
  onEventChipClick: (ev: CalendarEvent, date: string) => void;
  onEventMouseDown: (ev: CalendarEvent, e: React.MouseEvent) => void;
}

function CalendarGrid({
  cells, todayDate, selectedDate, slotsByDate, overflowByDate, draggingEvent, dragOverDate,
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
          const slots = slotsByDate.get(date) ?? [];
          const extra = overflowByDate.get(date) ?? 0;
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
              {slots.map((slot, i) => {
                if (!slot) return <span key={`e${i}`} className={styles.eventBarEmpty} aria-hidden />;
                const ev = slot.event;
                const barCls = [
                  styles.eventBar,
                  slot.isStart ? styles.barStart : "",
                  slot.isEnd ? styles.barEnd : "",
                  draggingEvent?.id === ev.id ? styles.draggingChip : "",
                ].filter(Boolean).join(" ");
                return (
                  <span
                    key={ev.id}
                    className={barCls}
                    style={ev.calendarColor ? {background: ev.description === "공휴일" ? "#c44343" : ev.calendarColor, color: "#fff"} : undefined}
                    title={ev.title}
                    onClick={(e) => { e.stopPropagation(); onEventChipClick(ev, date); }}
                    onMouseDown={(e) => onEventMouseDown(ev, e)}
                  >
                    {slot.showTitle ? <>{ev.isAllDay ? "" : `${formatTime(ev.startTime)} `}{ev.title}</> : " "}
                  </span>
                );
              })}
              {extra > 0 && <span className={styles.moreEvents}>+{extra}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(CalendarGrid);
