"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/store/theme";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function ThemeApplier() {
  const { accentColor, accentHover, loadSaved } = useThemeStore();

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--color-accent", accentColor);
    root.style.setProperty("--color-accent-hover", accentHover);
    // rgba 파생 변수 — color-mix() 브라우저 호환성 우회
    root.style.setProperty("--color-accent-soft", hexToRgba(accentColor, 0.15));
    root.style.setProperty("--color-accent-ultra-soft", hexToRgba(accentColor, 0.08));
  }, [accentColor, accentHover]);

  return null;
}
