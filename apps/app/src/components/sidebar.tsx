import { useState, useCallback, useRef } from "react";
import { Link } from "@tanstack/react-router";
import SidebarAccount from "./sidebar-account";
import styles from "./sidebar.module.css";

// 설정은 아래 계정 메뉴(⋯)에서 연다
const NAV_ITEMS = [
  { href: "/schedule", label: "일정", icon: "📅" },
  { href: "/todo", label: "할일", icon: "✅" },
  { href: "/memo", label: "메모", icon: "📝" },
  { href: "/chat", label: "AI 브리핑", icon: "💬" },
] as const;

const ICON_ONLY_THRESHOLD = 130;
const ICON_ONLY_WIDTH = 56;
const DEFAULT_WIDTH = 180;
const MIN_WIDTH = 56;
const MAX_WIDTH = 320;

/**
 * 저장된 너비.
 * 저장된 값이 없으면 Number(null) = 0 → 최소 너비(아이콘 전용)가 된다. Next 시절 동작 그대로 유지.
 */
function readSavedWidth(): number {
  const saved = Number(localStorage.getItem("sidebar-width"));
  if (!Number.isFinite(saved)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, saved));
}

export default function Sidebar() {
  const [width, setWidth] = useState(readSavedWidth);
  const [isIconOnly, setIsIconOnly] = useState(() => width <= ICON_ONLY_WIDTH);
  // pointerdown/pointermove 간 드래그 시작값 공유 (모두 React 이벤트로 처리해 좌표계 일관성 보장)
  const dragStartRef = useRef({ x: 0, width: DEFAULT_WIDTH });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartRef.current = { x: e.clientX, width };
      document.body.style.cursor = "col-resize";
    },
    [width],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const { x: startX, width: startWidth } = dragStartRef.current;
      const newWidth = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth + (e.clientX - startX)),
      );

      if (newWidth <= ICON_ONLY_THRESHOLD) {
        setWidth(ICON_ONLY_WIDTH);
        setIsIconOnly(true);
      } else {
        setWidth(newWidth);
        setIsIconOnly(false);
      }
    },
    [],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      document.body.style.cursor = "";
      setWidth((w) => {
        localStorage.setItem("sidebar-width", String(w));
        return w;
      });
    },
    [],
  );

  return (
    <aside
      className={`${styles.sidebar} ${isIconOnly ? styles.iconOnly : ""}`}
      style={{ width }}
    >
      <div className={styles.logo}>
        <img className={styles.logoIcon} src="/cali-logo.svg" alt="Cali Logo" />
      </div>
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          // 하위 경로(/schedule/...)에서도 켜진다 (TanStack Router 기본 부분 일치)
          <Link
            key={item.href}
            to={item.href}
            className={styles.navItem}
            activeProps={{ className: styles.active }}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </Link>
        ))}
      </nav>
      <SidebarAccount iconOnly={isIconOnly} />
      <div
        className={styles.resizeHandle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </aside>
  );
}
