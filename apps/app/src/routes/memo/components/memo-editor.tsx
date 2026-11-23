import { useEffect, useState } from "react";
import type { Memo, MemoProperty } from "@cali/shared";
import { IconTrash } from "@/components/icons";
import type { MemoSaveState } from "@/store/memos";
import BlockEditor from "./block-editor";
import PropertyField from "./property-field";
import { PROPERTY_TYPE_LABELS } from "../memo-labels";
import styles from "../page.module.css";

const SAVE_LABELS: Record<MemoSaveState, string> = {
  idle: "",
  saving: "저장 중…",
  saved: "저장됨",
  error: "저장하지 못했습니다",
};

/** 편집 중인 메모. 메모가 바뀌면 부모가 key로 새로 만든다 */
export default function MemoEditor({
  memo,
  properties,
  saveState,
  onEdit,
  onDelete,
  onManageProperties,
}: {
  memo: Memo;
  properties: MemoProperty[];
  saveState: MemoSaveState;
  onEdit: (patch: Partial<Pick<Memo, "title" | "content" | "values">>) => void;
  onDelete: () => void;
  onManageProperties: () => void;
}) {
  // 지우기는 두 번 눌러서(3초 안)
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  const updated = new Date(memo.updatedAt).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className={styles.editor}>
      <div className={styles.editorTop}>
        <span
          className={`${styles.saveState}${saveState === "error" ? ` ${styles.saveError}` : ""}`}
        >
          {SAVE_LABELS[saveState] || `${updated} 수정`}
        </span>
        <button
          type="button"
          className={`${styles.deleteBtn}${confirming ? ` ${styles.deleteConfirm}` : ""}`}
          title="메모 지우기"
          onClick={() => (confirming ? onDelete() : setConfirming(true))}
        >
          <IconTrash />
          {confirming && <span>한 번 더 누르면 지워요</span>}
        </button>
      </div>

      <input
        className={styles.titleInput}
        value={memo.title}
        placeholder="제목 없음"
        maxLength={500}
        onChange={(e) => onEdit({ title: e.target.value })}
      />

      <div className={styles.properties}>
        {properties.map((p) => (
          <div key={p.id} className={styles.propertyRow}>
            <span
              className={styles.propertyName}
              title={PROPERTY_TYPE_LABELS[p.type]}
            >
              {p.name}
            </span>
            <PropertyField
              property={p}
              value={memo.values[String(p.id)]}
              onChange={(value) => {
                const values = { ...memo.values };
                if (value === undefined) delete values[String(p.id)];
                else values[String(p.id)] = value;
                onEdit({ values });
              }}
            />
          </div>
        ))}
        <button
          type="button"
          className={styles.manageLink}
          onClick={onManageProperties}
        >
          {properties.length ? "속성 관리" : "+ 속성 추가"}
        </button>
      </div>

      <BlockEditor
        initialContent={memo.content}
        onChange={(content) => onEdit({ content })}
      />
    </div>
  );
}
