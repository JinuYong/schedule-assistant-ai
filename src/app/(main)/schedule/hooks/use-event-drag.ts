import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarEvent } from "@/store/events";
import { getEventDateKey } from "../calendar-utils";

interface EventDragOptions {
  /** 다른 날짜로 드롭 시 (이동) */
  onDrop: (ev: CalendarEvent, targetDate: string) => void;
  /** 드래그 없이 클릭 시 (상세 보기) */
  onClick: (ev: CalendarEvent) => void;
}

/**
 * 이벤트 칩 드래그-이동 + 클릭 구분 로직.
 *
 * HTML5 DnD 대신 document 레벨 마우스 이벤트로 처리한다.
 * 6px 이상 이동하면 드래그(이동), 그렇지 않으면 클릭(상세)으로 판정.
 * optsRef로 콜백 최신값을 유지해 effect 내 stale closure를 방지한다.
 */
export function useEventDrag(opts: EventDragOptions) {
  const [draggingEvent, setDraggingEvent] = useState<CalendarEvent | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });

  const dragStateRef = useRef<CalendarEvent | null>(null);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const hasDragMovedRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const startDrag = useCallback((ev: CalendarEvent, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragStateRef.current = ev;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    hasDragMovedRef.current = false;
    setDraggingEvent(ev);
    setGhostPos({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!draggingEvent) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      if (!hasDragMovedRef.current && Math.sqrt(dx * dx + dy * dy) > 6) {
        hasDragMovedRef.current = true;
      }
      setGhostPos({x: e.clientX, y: e.clientY});
      const el = document.elementFromPoint(e.clientX, e.clientY);
      setDragOverDate(el?.closest<HTMLElement>("[data-date]")?.dataset.date ?? null);
    };

    const onUp = (e: MouseEvent) => {
      const ev = dragStateRef.current;
      dragStateRef.current = null;
      setDraggingEvent(null);
      setDragOverDate(null);

      if (!hasDragMovedRef.current) {
        // 클릭(드래그 없음) → 상세 모달 표시
        if (ev) optsRef.current.onClick(ev);
        return;
      }

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const targetDate = el?.closest<HTMLElement>("[data-date]")?.dataset.date ?? null;
      if (ev && targetDate && targetDate !== getEventDateKey(ev)) {
        optsRef.current.onDrop(ev, targetDate);
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [draggingEvent]); // eslint-disable-line

  return { draggingEvent, dragOverDate, ghostPos, startDrag };
}
