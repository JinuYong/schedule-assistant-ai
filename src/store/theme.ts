import { create } from "zustand";

export interface ThemeColor {
  label: string;
  color: string; // 6자리 hex
  hover: string; // 약간 어두운 hover 색상
}

export const THEME_COLORS: ThemeColor[] = [
  { label: "핑크",   color: "#ec91d3", hover: "#e070c4" },
  { label: "퍼플",   color: "#c57dea", hover: "#b060d8" },
  { label: "로즈",   color: "#e788b7", hover: "#d468a0" },
  { label: "골드",   color: "#eeb423", hover: "#d49c0d" },
  { label: "시안",   color: "#08aac5", hover: "#0692a8" },
];

interface ThemeStore {
  accentColor: string;
  accentHover: string;
  setTheme: (color: string, hover: string) => void;
  loadSaved: () => void;
}

const STORAGE_KEY = "theme.accent";

export const useThemeStore = create<ThemeStore>((set) => ({
  accentColor: THEME_COLORS[0].color,
  accentHover: THEME_COLORS[0].hover,

  setTheme: (color, hover) => {
    set({ accentColor: color, accentHover: hover });
    // 브라우저 localStorage 저장
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ color, hover }));
    }
    // tauri-store 저장
    import("@/lib/tauri-store").then(({ storeSet }) => storeSet(STORAGE_KEY, { color, hover }));
  },

  loadSaved: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const { color, hover } = JSON.parse(raw);
        set({ accentColor: color, accentHover: hover });
      } catch {
        /* 무시 */
      }
    }
  },
}));
