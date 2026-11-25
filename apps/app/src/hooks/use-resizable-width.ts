import { useCallback, useRef, useState } from "react";

interface Options {
  /** localStorage 키(넓이를 기기에 기억) */
  storageKey: string;
  initial: number;
  min: number;
  max: number;
  /**
   * 손잡이가 패널의 어느 쪽에 붙는지.
   * "end" = 패널 오른쪽(오른쪽으로 끌면 넓어짐), "start" = 패널 왼쪽(왼쪽으로 끌면 넓어짐)
   */
  edge: "start" | "end";
}

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

function readSaved({ storageKey, initial, min, max }: Options): number {
  try {
    const saved = Number(localStorage.getItem(storageKey));
    if (saved && Number.isFinite(saved)) return clamp(saved, min, max);
  } catch {
    // 기억 못 하면 기본값
  }
  return initial;
}

/**
 * 끌어서 넓이를 바꾸는 패널. 손잡이 요소에 `handleProps`를 펼쳐 붙인다.
 * 끌기를 놓으면 넓이를 저장한다. 손잡이를 두 번 누르면 기본 넓이로.
 */
export function useResizableWidth(options: Options) {
  const [width, setWidth] = useState(() => readSaved(options));
  const drag = useRef({ x: 0, width: 0 });
  // 놓을 때 저장할 넓이. 렌더를 기다리면 마지막 움직임이 빠지므로 끌 때마다 바로 적는다
  const latest = useRef(width);
  const { storageKey, initial, min, max, edge } = options;

  const save = useCallback(
    (w: number) => {
      try {
        localStorage.setItem(storageKey, String(w));
      } catch {
        // 저장 못 해도 이번 화면에선 그대로
      }
    },
    [storageKey],
  );

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width: latest.current };
    document.body.style.cursor = "col-resize";
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const delta = e.clientX - drag.current.x;
      const w = clamp(
        drag.current.width + (edge === "end" ? delta : -delta),
        min,
        max,
      );
      latest.current = w;
      setWidth(w);
    },
    [edge, min, max],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      document.body.style.cursor = "";
      save(latest.current);
    },
    [save],
  );

  const onDoubleClick = useCallback(() => {
    latest.current = initial;
    setWidth(initial);
    save(initial);
  }, [initial, save]);

  return {
    width,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick,
    },
  };
}
