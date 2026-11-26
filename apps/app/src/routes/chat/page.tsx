import { Fragment, useRef, useEffect, useMemo, useCallback } from "react";
import { useAiStore } from "@/store/ai";
import styles from "./page.module.css";

const SUGGESTIONS = [
  "오늘 일정 요약해줘",
  "이번 주에 뭐 있어?",
  "내일 오후 3시에 치과 넣어줘",
];

/**
 * AI 채팅. 세션은 플로팅·일정 빠른 입력과 같이 쓰지만(맥락 공유), 여기엔 채팅에서 한 말만 보인다.
 */
export default function ChatPage() {
  const allEntries = useAiStore((s) => s.entries);
  const entries = useMemo(
    () => allEntries.filter((e) => e.origin === "chat"),
    [allEntries],
  );
  const draft = useAiStore((s) => s.chatDraft);
  const setDraft = useAiStore((s) => s.setChatDraft);
  const ask = useAiStore((s) => s.ask);
  const newSession = useAiStore((s) => s.newSession);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  // textarea 자동 높이.
  // box-sizing이 border-box라 scrollHeight(= content + padding)만 넣으면
  // 테두리 두께만큼 모자라 여러 줄에서 스크롤바가 생긴다. border를 더해 보정한다.
  // 한 줄일 때는 CSS의 min-height(= --control-h)가 받쳐 전송 버튼과 높이가 맞는다.
  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(el.scrollHeight + border, 160)}px`;
  };

  const send = useCallback(() => {
    const text = draft.trim();
    // 앞 요청이 끝나지 않았어도 보낸다(세션이 줄을 세워 차례로 처리)
    if (!text) return;
    ask({ text, origin: "chat" });
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [draft, ask, setDraft]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 한글 조합 중 Enter는 글자 확정이다(보내면 마지막 글자가 남는다)
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>AI 브리핑</h1>
        {entries.length > 0 && (
          <button className={styles.clearBtn} onClick={newSession}>
            새 대화
          </button>
        )}
      </div>

      <div className={styles.messageArea}>
        {entries.length === 0 && (
          <div className={styles.welcome}>
            <p className={styles.welcomeTitle}>무엇이든 물어보세요</p>
            <p className={styles.welcomeHint}>
              일정을 묻고, 만들고, 옮기고, 지울 수 있어요. 플로팅 창에서 한 일도
              기억해요.
            </p>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className={styles.suggestionChip}
                  onClick={() => setDraft(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {entries.map((entry) => (
          <Fragment key={entry.id}>
            <div className={`${styles.message} ${styles.userMessage}`}>
              <div className={styles.bubble}>{entry.text}</div>
            </div>
            <div className={`${styles.message} ${styles.assistantMessage}`}>
              <div
                className={`${styles.bubble} ${entry.status === "error" ? styles.errorBubble : ""}`}
                data-status={entry.status}
              >
                {entry.status === "error"
                  ? entry.error
                  : entry.reply ||
                    (entry.status === "done" ? (
                      "완료했어요."
                    ) : (
                      <span className={styles.cursor} />
                    ))}
                {entry.actions.length > 0 && (
                  <ul className={styles.actions}>
                    {entry.actions.map((a, i) => (
                      <li
                        key={i}
                        className={a.ok ? styles.actionOk : styles.actionFailed}
                      >
                        {a.ok ? "✓" : "✗"} {a.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Fragment>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
          rows={1}
        />
        <button
          className={styles.sendBtn}
          onClick={send}
          disabled={!draft.trim()}
        >
          전송
        </button>
      </div>
    </div>
  );
}
