import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_SIDE_WIDTH = 280;
const MIN_SIDE_WIDTH = 200;
const MAX_SIDE_WIDTH = 500;

/**
 * 우측 패널 너비 상태 + 드래그 리사이즈 핸들러.
 * localStorage("schedule-side-width")에 복원/저장한다.
 */
export function useSidePanelWidth() {
  const [sidePanelWidth, setSidePanelWidth] = useState(DEFAULT_SIDE_WIDTH);
  const sideDragRef = useRef({ x: 0, width: DEFAULT_SIDE_WIDTH });

  // 너비 localStorage 복원
  useEffect(() => {
    const saved = localStorage.getItem("schedule-side-width");
    // SSR 하이드레이션 일치를 위해 마운트 후 1회 복원하는 의도된 패턴
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setSidePanelWidth(Math.max(MIN_SIDE_WIDTH, Math.min(MAX_SIDE_WIDTH, Number(saved))));
  }, []);

  const handleSidePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    sideDragRef.current = { x: e.clientX, width: sidePanelWidth };
    document.body.style.cursor = "col-resize";
  }, [sidePanelWidth]);

  const handleSidePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const { x: startX, width: startWidth } = sideDragRef.current;
    // 왼쪽으로 드래그 → 패널 넓어짐 (delta 반전)
    const newWidth = Math.min(MAX_SIDE_WIDTH, Math.max(MIN_SIDE_WIDTH, startWidth - (e.clientX - startX)));
    setSidePanelWidth(newWidth);
  }, []);

  const handleSidePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.cursor = "";
    setSidePanelWidth((w) => {
      localStorage.setItem("schedule-side-width", String(w));
      return w;
    });
  }, []);

  return { sidePanelWidth, handleSidePointerDown, handleSidePointerMove, handleSidePointerUp };
}
