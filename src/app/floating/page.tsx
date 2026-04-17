"use client";

import { useState, useEffect, useRef } from "react";
import { isTauri } from "@/lib/tauri-store";
import { emit } from "@tauri-apps/api/event";
import { hideFloatingWindow } from "@/lib/floating-window";
import { parseScheduleText } from "@/lib/claude";
import { createEvent, getCalendarList, type CalendarListItem } from "@/lib/google-calendar";
import { useAuthStore } from "@/store/auth";
import { useEventsStore } from "@/store/events";
import styles from "./page.module.css";

export default function FloatingPage() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const googleTokens = useAuthStore((s) => s.googleTokens);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 창이 포커스를 잃으면 바로 숨기기
  useEffect(() => {
    const onWindowBlur = async () => {
      if (isTauri()) await hideFloatingWindow();
    };
    window.addEventListener("blur", onWindowBlur);
    return () => window.removeEventListener("blur", onWindowBlur);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status === "loading") return;
    setStatus("loading");

    try {
      const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

      // 캘린더 목록을 먼저 가져와 Claude에 컨텍스트로 전달 (캐시됨)
      let calendars: CalendarListItem[] = [];
      if (googleTokens?.access_token) {
        calendars = await getCalendarList(googleTokens.access_token);
      }
      const calendarNames = calendars.map((c) => c.summary);

      const parsed = await parseScheduleText(input.trim(), now, calendarNames);

      if (!parsed) throw new Error("파싱 실패");

      if (googleTokens?.access_token) {
        // Claude가 추출한 calendarName을 실제 캘린더 ID로 매핑
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
        // 메인 창에 일정 변경 알림 (Tauri 이벤트로 창 간 통신)
        await emit("calendar-mutated");
      }

      setStatus("done");
      setTimeout(async () => {
        if (isTauri()) await hideFloatingWindow();
        setInput("");
        setStatus("idle");
      }, 700);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (isTauri()) await hideFloatingWindow();
    }
  };

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <img src="/icon-source.png" className={styles.appIcon} alt="" draggable={false} />
        <input
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="일정을 자연어로 입력하세요 (예: 내일 오후 3시 팀 미팅)"
          disabled={status === "loading"}
          autoComplete="off"
        />
        {status === "loading" && <span className={`${styles.indicator} ${styles.loading}`}>⏳</span>}
        {status === "done" && <span className={`${styles.indicator} ${styles.done}`}>✓</span>}
        {status === "error" && <span className={`${styles.indicator} ${styles.error}`}>✗</span>}
      </form>
    </div>
  );
}
