import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarEvent } from "@/store/events";
import { getEventDateKey } from "@/lib/event-match";

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
 * 6px 이상 이동해야 드래그(이동)로 판정하고, 이때 비로소 드래그 UI(고스트·강조)가
 * 켜진다. 단순 클릭(이동 없음)은 상세 보기만 하고 UI는 그대로 둔다.
 * optsRef로 콜백 최신값을 유지해 effect 내 stale closure를 방지한다.
 */
export function useEventDrag(opts: EventDragOptions) {
  const [draggingEvent, setDraggingEvent] = useState<CalendarEvent | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  // 마우스를 누른 동안만 true. 실제 드래그(draggingEvent)와 구분 — 누름만으론 UI 안 바뀜
  const [pressing, setPressing] = useState(false);

  const candidateRef = useRef<CalendarEvent | null>(null);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const hasDragMovedRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const startDrag = useCallback((ev: CalendarEvent, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    candidateRef.current = ev;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    hasDragMovedRef.current = false;
    setPressing(true); // 리스너만 붙이고, 드래그 UI는 임계값 넘을 때 켠다
  }, []);

  useEffect(() => {
    if (!pressing) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      if (!hasDragMovedRef.current) {
        if (Math.sqrt(dx * dx + dy * dy) <= 6) return; // 임계값 미만 → 아직 클릭
        hasDragMovedRef.current = true;
        setDraggingEvent(candidateRef.current); // 여기서 비로소 드래그 UI 진입
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }
      setGhostPos({ x: e.clientX, y: e.clientY });
      const el = document.elementFromPoint(e.clientX, e.clientY);
      setDragOverDate(el?.closest<HTMLElement>("[data-date]")?.dataset.date ?? null);
    };

    const onUp = (e: MouseEvent) => {
      const ev = candidateRef.current;
      candidateRef.current = null;
      setPressing(false);
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

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [pressing]); // eslint-disable-line

  return { draggingEvent, dragOverDate, ghostPos, startDrag };
}
