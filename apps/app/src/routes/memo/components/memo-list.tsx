import type { MemoProperty, MemoSummary } from "@cali/shared";
import { optionClass, selectedOptions } from "../memo-labels";
import styles from "../page.module.css";

function shortDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("ko-KR", {
        month: "short",
        day: "numeric",
        ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
      });
}

export default function MemoList({
  memos,
  properties,
  selectedId,
  onSelect,
}: {
  memos: MemoSummary[];
  properties: MemoProperty[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <ul className={styles.list}>
      {memos.map((m) => {
        const tags = selectedOptions(m.values, properties);
        return (
          <li key={m.id}>
            <button
              type="button"
              className={`${styles.item}${m.id === selectedId ? ` ${styles.itemActive}` : ""}`}
              onClick={() => onSelect(m.id)}
            >
              <span className={styles.itemHead}>
                <span
                  className={`${styles.itemTitle}${m.title ? "" : ` ${styles.untitled}`}`}
                >
                  {m.title || "제목 없음"}
                </span>
                <span className={styles.itemDate}>
                  {shortDate(m.updatedAt)}
                </span>
              </span>
              {m.preview && (
                <span className={styles.itemPreview}>{m.preview}</span>
              )}
              {tags.length > 0 && (
                <span className={styles.itemChips}>
                  {tags.map((o) => (
                    <span key={o.id} className={optionClass(o.color)}>
                      {o.name}
                    </span>
                  ))}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
