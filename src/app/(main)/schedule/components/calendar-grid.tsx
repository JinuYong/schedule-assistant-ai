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
                // 빈 레인 또는 앞 칸 막대에 덮인 칸 → 투명 자리채움(높이만 확보)
                if (!slot || slot.covered) return <span key={`e${i}`} className={styles.eventBarEmpty} aria-hidden />;
                const ev = slot.event;
                const spanning = slot.span >= 2;
                const barCls = [
                  styles.eventBar,
                  slot.isStart ? styles.barStart : "",
                  slot.isEnd ? styles.barEnd : "",
                  spanning ? styles.barSpan : "",
                  draggingEvent?.id === ev.id ? styles.draggingChip : "",
                ].filter(Boolean).join(" ");
                const barStyle: React.CSSProperties = ev.calendarColor
                  ? {background: ev.description === "공휴일" ? "#c44343" : ev.calendarColor, color: "#fff"}
                  : {};
                // span개 칸을 가로로 덮되, 실제 시작/끝 칸에만 안쪽 여백(GAP)을 줘 격자선과 떨어뜨림
                // (이어지는 칸 경계에는 여백 없이 연속)
                const GAP = 3;
                const left = slot.isStart ? GAP : 0;
                const right = slot.isEnd ? GAP : 0;
                barStyle.width = `calc(${slot.span} * 100% + ${slot.span - 1}px - ${left + right}px)`;
                if (left) barStyle.marginLeft = `${left}px`;
                return (
                  <span
                    key={ev.id}
                    className={barCls}
                    style={barStyle}
                    title={ev.title}
                    onClick={(e) => { e.stopPropagation(); onEventChipClick(ev, date); }}
                    onMouseDown={(e) => onEventMouseDown(ev, e)}
                  >
                    {ev.isAllDay ? "" : `${formatTime(ev.startTime)} `}{ev.title}
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
