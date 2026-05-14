"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { isTauri } from "@/lib/tauri-store";
import { emit } from "@tauri-apps/api/event";
import { hideFloatingWindow } from "@/lib/floating-window";
import { registerHotkey, unregisterHotkey } from "@/lib/hotkey";
import { parseScheduleText } from "@/lib/claude";
import { createEvent, getCalendarList, type CalendarListItem } from "@/lib/google-calendar";
import { useAuthStore } from "@/store/auth";
import styles from "./page.module.css";

export default function FloatingPage() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const googleTokens = useAuthStore((s) => s.googleTokens);

  // window.focus 이벤트: document가 이미 focused 상태이므로 딜레이 없이 바로 input.focus()
  // Rust window.eval() 폴링의 백업 역할
  useEffect(() => {
    const onFocus = () => { inputRef.current?.focus(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // floating-shown → ESC 글로벌 단축키 등록 + input 포커스
  // floating-should-hide → ESC 해제 + 창 닫기
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let unlistenShown: (() => void) | undefined;
    let escRegistered = false;

    const registerEsc = async () => {
      if (escRegistered) return;
      const ok = await registerHotkey("Escape", async () => {
        await unregisterHotkey("Escape");
        escRegistered = false;
        await hideFloatingWindow(true);
      });
      if (ok) escRegistered = true;
    };

    const unregisterEsc = async () => {
      if (!escRegistered) return;
      await unregisterHotkey("Escape");
      escRegistered = false;
    };

    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlistenShown = await listen("floating-shown", () => {
        registerEsc();
        setInput("");   // React 상태 초기화 → controlled input 값 지움
      });
      unlisten = await listen("floating-should-hide", async () => {
        await unregisterEsc();
        await hideFloatingWindow();
      });
    })();

    return () => {
      unlisten?.();
      unlistenShown?.();
      unregisterEsc();
    };
  }, []);

  const handleSubmit = useCallback(async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!input.trim() || status === "loading") return;
    setStatus("loading");

    try {
      const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

      let calendars: CalendarListItem[] = [];
      if (googleTokens?.access_token) {
        calendars = await getCalendarList(googleTokens.access_token);
      }
      const calendarNames = calendars.map((c) => c.summary);

      const parsed = await parseScheduleText(input.trim(), now, calendarNames);
      if (!parsed) throw new Error("파싱 실패");

      if (googleTokens?.access_token) {
        let calendarId = "primary";
        if (parsed.calendarName) {
          const matched = calendars.find(
            (c) => c.summary.toLowerCase() === parsed.calendarName!.toLowerCase()
          );
          if (matched) calendarId = matched.id;
        }

        await createEvent(googleTokens.access_token, {
          id: "",
          summary: parsed.title,
          description: parsed.description,
          location: parsed.location,
          ...(parsed.isAllDay
            ? {
              start: { date: parsed.startTime.split("T")[0] },
              end: { date: parsed.endTime.split("T")[0] },
            }
            : {
              start: { dateTime: parsed.startTime, timeZone: "Asia/Seoul" },
              end: { dateTime: parsed.endTime, timeZone: "Asia/Seoul" },
            }),
        }, calendarId);
        await emit("calendar-mutated");
      }

      setStatus("done");
      setTimeout(async () => {
        if (isTauri()) await hideFloatingWindow();
        setInput("");
        setStatus("idle");
      }, 1500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }, [input, status, googleTokens]); // eslint-disable-line

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <img src="/icon-source.png" className={styles.appIcon} alt="" draggable={false} />
        <input
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="일정을 자연어로 입력하세요 (예: 내일 오후 3시 팀 미팅)"
          disabled={status === "loading"}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {status === "loading" && <span className={styles.spinning}>⏳</span>}
        {status === "done"    && <span className={`${styles.indicator} ${styles.done}`}>✓ 등록 완료</span>}
        {status === "error"   && <span className={`${styles.indicator} ${styles.error}`}>✗ 등록 실패</span>}
      </form>
    </div>
  );
}