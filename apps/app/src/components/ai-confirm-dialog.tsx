import { useEffect, useRef } from "react";
import { useAiStore } from "@/store/ai";
import styles from "./ai-confirm-dialog.module.css";

/** AI가 일정을 고치거나 지우기 전에 묻는 창(메인 창 출처). 플로팅 출처는 플로팅 창이 띄운다 */
export default function AiConfirmDialog() {
  const confirm = useAiStore((s) => s.confirm);
  const answer = useAiStore((s) => s.answerConfirm);
  const okRef = useRef<HTMLButtonElement>(null);
  const visible = confirm && confirm.origin !== "floating" ? confirm : null;

  useEffect(() => {
    if (!visible) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        answer(visible.id, false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, answer]);

  if (!visible) return null;
  const [title, ...rest] = visible.text.split("\n");
  const destructive = title.includes("삭제");
  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) answer(visible.id, false);
      }}
    >
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-labelledby="ai-confirm-title"
      >
        <p id="ai-confirm-title" className={styles.title}>
          {title}
        </p>
        {rest.length > 0 && <p className={styles.detail}>{rest.join("\n")}</p>}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancel}
            onClick={() => answer(visible.id, false)}
          >
            취소
          </button>
          <button
            ref={okRef}
            type="button"
            className={`${styles.ok} ${destructive ? styles.danger : ""}`}
            onClick={() => answer(visible.id, true)}
          >
            {destructive ? "삭제" : "고치기"}
          </button>
        </div>
      </div>
    </div>
  );
}
