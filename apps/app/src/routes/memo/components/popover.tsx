// 버튼 아래에 뜨는 작은 창. 목록 칸이 스크롤 영역이라 body에 붙여(portal) 잘리지 않게 한다.
// 안에서 또 연 팝오버(선택지 편집 등)는 한 단계 깊게 본다 — 깊은 쪽을 눌러도 바깥 창은 안 닫힌다.

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import styles from "./popover.module.css";

const DepthContext = createContext(0);
const GAP = 4;
const MARGIN = 8;

/** Esc는 맨 위(마지막에 연) 창만 닫는다 */
const openStack: (() => void)[] = [];

export default function Popover({
  anchor,
  onClose,
  children,
  align = "start",
  width,
}: {
  /** 이 요소 아래에 띄운다. 이 요소를 누르는 건 바깥 클릭으로 치지 않는다(여닫기는 버튼이 한다) */
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "end";
  width?: number;
}) {
  const depth = useContext(DepthContext) + 1;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // 자리 잡기: 아래 공간이 모자라면 위로, 화면 밖으로 안 나가게
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const el = ref.current;
      if (!a || !el) return;
      const { offsetWidth: w, offsetHeight: h } = el;
      let top = a.bottom + GAP;
      if (top + h > window.innerHeight - MARGIN && a.top - GAP - h >= MARGIN)
        top = a.top - GAP - h;
      top = Math.max(MARGIN, Math.min(top, window.innerHeight - MARGIN - h));
      let left = align === "end" ? a.right - w : a.left;
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - MARGIN - w));
      setPos((p) =>
        p && p.top === top && p.left === left ? p : { top, left },
      );
    };
    place();
    const observer = new ResizeObserver(place);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, align]);

  useEffect(() => {
    const close = () => closeRef.current();
    openStack.push(close);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || anchor.current?.contains(target)) return;
      const inside = target.closest<HTMLElement>("[data-popover-depth]");
      // 이 창이나 이 창에서 연 더 깊은 창 안이면 그대로
      if (inside && Number(inside.dataset.popoverDepth) >= depth) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      if (openStack.at(-1) !== close) return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      openStack.splice(openStack.indexOf(close), 1);
    };
  }, [anchor, depth]);

  return createPortal(
    <DepthContext.Provider value={depth}>
      <div
        ref={ref}
        className={styles.popover}
        data-popover-depth={depth}
        style={{
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          width,
          // 자리 잡기 전엔 투명하게만(visibility: hidden이면 autoFocus가 안 먹는다)
          opacity: pos ? 1 : 0,
        }}
      >
        {children}
      </div>
    </DepthContext.Provider>,
    document.body,
  );
}

/** 팝오버 안 한 줄짜리 메뉴 항목 */
export function MenuItem({
  icon,
  children,
  trailing,
  active,
  danger,
  onClick,
  onMouseEnter,
  title,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  /** 키보드로 고른 항목 */
  active?: boolean;
  danger?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        styles.item,
        active && styles.itemActive,
        danger && styles.itemDanger,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      title={title}
      disabled={disabled}
    >
      {icon !== undefined && <span className={styles.itemIcon}>{icon}</span>}
      <span className={styles.itemLabel}>{children}</span>
      {trailing !== undefined && (
        <span className={styles.itemTrailing}>{trailing}</span>
      )}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className={styles.label}>{children}</div>;
}

export function MenuDivider() {
  return <div className={styles.divider} />;
}

export function MenuInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={styles.input} />;
}

/** 팝오버를 붙일 버튼 ref와 여닫는 상태. `const [btnRef, menu] = usePopover()` */
export function usePopover<T extends HTMLElement = HTMLButtonElement>() {
  const anchorRef = useRef<T>(null);
  const [open, setOpen] = useState(false);
  return [
    anchorRef,
    {
      open,
      toggle: () => setOpen((o) => !o),
      close: () => setOpen(false),
    },
  ] as const;
}
