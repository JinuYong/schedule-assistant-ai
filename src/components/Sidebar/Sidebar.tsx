"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";
import { useCallback, useEffect, useRef, useState } from 'react'

const NAV_ITEMS = [
  { href: "/schedule", label: "일정", icon: "📅" },
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

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-width");
    if (saved) {
      const w = Number(saved);
      setWidth(w);
      setIsIconOnly(w <= ICON_ONLY_THRESHOLD);
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (ev.clientX - startX)));

      if (newWidth <= ICON_ONLY_THRESHOLD) {
        setWidth(ICON_ONLY_WIDTH);
        setIsIconOnly(true);
      } else {
        setWidth(newWidth);
        setIsIconOnly(false);
      }
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";

      setWidth((w) => {
        localStorage.setItem("sidebar-width", String(w));
        return w;
      });
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [width])

  return (
    <aside className={`${styles.sidebar} ${isIconOnly ? styles.iconOnly : ""}`} style={{ width }}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>🗓</span>
        <span className={styles.logoText}>Cali</span>
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
      <div className={styles.resizeHandle} onMouseDown={handleMouseDown} />
    </aside>
  );
}
