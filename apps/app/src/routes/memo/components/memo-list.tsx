import type { MemoProperty, MemoSummary } from "@cali/shared";
import styles from "../page.module.css";
import PropertySummary from "./property-summary";

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
  /** 목록에 보일 속성(보기 설정에서 고른 것) */
  properties: MemoProperty[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <ul className={styles.list}>
      {memos.map((m) => {
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
              <PropertySummary
                properties={properties}
                values={m.values}
                className={styles.itemProps}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
