"use client";

import { useState, useEffect, useRef } from "react";
import { isTauri } from "@/lib/tauri-store";
import { hideFloatingWindow } from "@/lib/floating-window";
import { parseScheduleText } from "@/lib/claude";
import { createEvent } from "@/lib/google-calendar";
import { useAuthStore } from "@/store/auth";
import { useEventsStore } from "@/store/events";
import styles from "./page.module.css";

export default function FloatingPage() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const googleTokens = useAuthStore((s) => s.googleTokens);
  const fetchEvents = useEventsStore((s) => s.fetchEvents);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status === "loading") return;
    setStatus("loading");

    try {
      const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      const parsed = await parseScheduleText(input.trim(), now);

      if (!parsed) throw new Error("파싱 실패");

      if (googleTokens?.access_token) {
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
        });
        // 메인 창 이벤트 목록 갱신
        fetchEvents(googleTokens.access_token);
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
        {status === "loading" && <span className={styles.indicator}>⏳</span>}
        {status === "done" && <span className={styles.indicator}>✓</span>}
        {status === "error" && <span className={styles.indicator}>✗</span>}
      </form>
    </div>
  );
}
