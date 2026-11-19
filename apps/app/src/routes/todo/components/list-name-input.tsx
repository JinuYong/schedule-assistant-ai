import { useRef, useState } from "react";
import styles from "../page.module.css";

/**
 * 목록 이름 입력(새 목록·이름 바꾸기 공용). Enter·바깥 클릭이면 저장, ESC면 취소.
 * 비우고 나가면 취소로 본다.
 */
export default function ListNameInput({
  initial = "",
  placeholder,
  onSave,
  onCancel,
}: {
  initial?: string;
  placeholder: string;
  /** false를 돌려주면(저장 실패) 입력을 그대로 둔다 */
  onSave: (name: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  // Enter로 저장하는 동안 입력이 비활성화되며 blur가 한 번 더 오므로 두 번 저장하지 않게 막는다
  const busy = useRef(false);

  const commit = async () => {
    if (busy.current) return;
    const name = value.trim();
    if (!name || name === initial) return onCancel();
    busy.current = true;
    setSaving(true);
    const ok = await onSave(name);
    busy.current = false;
    setSaving(false);
    if (ok) onCancel();
  };

  return (
    <input
      className={styles.listNameInput}
      value={value}
      placeholder={placeholder}
      maxLength={100}
      disabled={saving}
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        // 한글 조합 중 Enter는 글자 확정이라 저장하지 않는다
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") void commit();
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}
