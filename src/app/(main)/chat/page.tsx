"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { streamChat } from "@/lib/claude";
import { useEventsStore } from "@/store/events";
import { useChatStore, ChatMessage } from "@/store/chat";
import { showToast } from "@/store/toast";
import styles from "./page.module.css";

function buildSystemPrompt(events: ReturnType<typeof useEventsStore.getState>["events"]): string {
  const now = new Date();
  const todayStr = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  const todayKey = now.toISOString().split("T")[0]; // YYYY-MM-DD

  const todayEvents = events.filter((ev) => ev.startTime.startsWith(todayKey));
  const upcomingEvents = events
    .filter((ev) => ev.startTime > now.toISOString() && !ev.startTime.startsWith(todayKey))
    .slice(0, 5);

  let context = `당신은 AI 일정 관리 비서입니다. 오늘은 ${todayStr}입니다. 현재 시각: ${now.toLocaleTimeString("ko-KR")}.`;

  if (todayEvents.length > 0) {
    const list = todayEvents
      .map((ev) => {
        const time = ev.isAllDay
          ? "종일"
          : new Date(ev.startTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
        return `- ${time} ${ev.title}${ev.location ? ` (${ev.location})` : ""}`;
      })
      .join("\n");
    context += `\n\n오늘 일정:\n${list}`;
  } else {
    context += "\n\n오늘 등록된 일정이 없습니다.";
  }

  if (upcomingEvents.length > 0) {
    const list = upcomingEvents
      .map((ev) => {
        const date = new Date(ev.startTime).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
        const time = ev.isAllDay
          ? "종일"
          : new Date(ev.startTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
        return `- ${date} ${time} ${ev.title}`;
      })
      .join("\n");
    context += `\n\n다가오는 일정:\n${list}`;
  }

  context += "\n\n사용자의 질문에 한국어로 친절하고 간결하게 답변해주세요.";
  return context;
}

export default function ChatPage() {
  const { messages, setMessages, input, setInput, clear } = useChatStore();
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const events = useEventsStore((s) => s.events);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => { cleanupRef.current?.(); };
  }, []);

  // textarea 자동 높이
  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsStreaming(true);

    try {
      const system = buildSystemPrompt(events);
      const cleanup = await streamChat(
        newMessages.map((m) => ({ role: m.role, content: m.content })),
        (chunk) => {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: (updated[updated.length - 1]?.content ?? "") + chunk,
            };
            return updated;
          });
        },
        () => setIsStreaming(false),
        system
      );
      cleanupRef.current = cleanup;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const displayMsg = msg.includes("API 키")
        ? msg
        : `${msg}\n\n설정에서 Anthropic API 키를 확인해주세요.`;
      showToast(displayMsg);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: displayMsg };
        return updated;
      });
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages, events, setMessages, setInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>AI 브리핑</h1>
        {messages.length > 0 && (
          <button className={styles.clearBtn} onClick={clear} disabled={isStreaming}>새 대화</button>
        )}
      </div>

      <div className={styles.messageArea}>
        {messages.length === 0 && (
          <div className={styles.welcome}>
            <p className={styles.welcomeTitle}>무엇이든 물어보세요</p>
            <div className={styles.suggestions}>
              {["오늘 일정 요약해줘", "이번 주 할일 뭐 있어?", "내일 회의 준비 체크리스트"].map((s) => (
                <button key={s} className={styles.suggestionChip} onClick={() => setInput(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${styles.message} ${msg.role === "user" ? styles.userMessage : styles.assistantMessage}`}
          >
            <div className={styles.bubble}>
              {msg.content || (isStreaming && i === messages.length - 1 ? <span className={styles.cursor} /> : null)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={input}
          onChange={(e) => { setInput(e.target.value); adjustHeight(); }}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
          rows={1}
          disabled={isStreaming}
        />
        <button className={styles.sendBtn} onClick={sendMessage} disabled={!input.trim() || isStreaming}>
          전송
        </button>
      </div>
    </div>
  );
}
