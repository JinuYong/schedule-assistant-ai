"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";

const NAV_ITEMS = [
  { href: "/schedule", label: "일정", icon: "📅" },
  { href: "/todo", label: "할일", icon: "✅" },
  { href: "/chat", label: "AI 브리핑", icon: "💬" },
  { href: "/settings", label: "설정", icon: "⚙️" },
];

const ICON_ONLY_THRESHOLD = 130;
const ICON_ONLY_WIDTH = 56;
const DEFAULT_WIDTH = 180;
const MIN_WIDTH = 56;
const MAX_WIDTH = 320;

export default function Sidebar() {
  const pathname = usePathname();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isIconOnly, setIsIconOnly] = useState(false);
  // pointerdown/pointermove 간 드래그 시작값 공유 (모두 React 이벤트로 처리해 좌표계 일관성 보장)
  const dragStartRef = useRef({ x: 0, width: DEFAULT_WIDTH });

  // localStorage 복원은 hydration 이후에만 수행해야 서버/클라이언트 첫 렌더가 일치한다.
  useEffect(() => {
    const saved = Number(localStorage.getItem("sidebar-width"));
    if (!Number.isFinite(saved)) return;
    const nextWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, saved));
    setWidth(nextWidth);
    setIsIconOnly(nextWidth <= ICON_ONLY_WIDTH);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartRef.current = { x: e.clientX, width };
      document.body.style.cursor = "col-resize";
    },
    [width]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const { x: startX, width: startWidth } = dragStartRef.current;
      const newWidth = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth + (e.clientX - startX))
      );

      if (newWidth <= ICON_ONLY_THRESHOLD) {
        setWidth(ICON_ONLY_WIDTH);
        setIsIconOnly(true);
      } else {
        setWidth(newWidth);
        setIsIconOnly(false);
      }
    },
    []
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
    []
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
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            pathname === `${item.href}/` ||
            pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${isActive ? styles.active : ""}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div
        className={styles.resizeHandle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </aside>
  );
}
