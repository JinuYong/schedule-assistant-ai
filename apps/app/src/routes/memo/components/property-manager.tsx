import { useEffect, useState } from "react";
import {
  memoOptionColors,
  memoPropertyTypes,
  type MemoOptionColor,
  type MemoProperty,
  type MemoPropertyType,
} from "@cali/shared";
import { IconClose, IconTrash } from "@/components/icons";
import { useMemosStore } from "@/store/memos";
import {
  OPTION_COLOR_LABELS,
  PROPERTY_TYPE_LABELS,
  hasOptions,
  newOption,
  optionClass,
} from "../memo-labels";
import styles from "../page.module.css";

/** 바뀐 글자를 Enter나 칸을 떠날 때 올리는 입력(비우면 원래대로) */
function CommitInput({
  value,
  onCommit,
  className,
  placeholder,
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  // 서버에서 값이 바뀌면(다른 곳에서 고침) 입력도 따라간다
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value);
  }
  const commit = () => {
    const t = text.trim();
    if (!t) setText(value);
    else if (t !== value) onCommit(t);
  };
  return (
    <input
      className={className}
      value={text}
      placeholder={placeholder}
      maxLength={100}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}

function PropertyItem({ property }: { property: MemoProperty }) {
  const updateProperty = useMemosStore((s) => s.updateProperty);
  const deleteProperty = useMemosStore((s) => s.deleteProperty);
  const [confirming, setConfirming] = useState(false);
  const [newName, setNewName] = useState("");
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  const setOptions = (options: MemoProperty["options"]) =>
    void updateProperty(property.id, { options });
  const addOption = () => {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    setOptions([...property.options, newOption(name, property.options)]);
  };

  return (
    <li className={styles.managerItem}>
      <div className={styles.managerRow}>
        <CommitInput
          className={styles.fieldInput}
          value={property.name}
          onCommit={(name) => void updateProperty(property.id, { name })}
        />
        <span className={styles.typeBadge}>
          {PROPERTY_TYPE_LABELS[property.type]}
        </span>
        <button
          type="button"
          className={`${styles.deleteBtn}${confirming ? ` ${styles.deleteConfirm}` : ""}`}
          title="속성 지우기"
          onClick={() =>
            confirming ? void deleteProperty(property.id) : setConfirming(true)
          }
        >
          <IconTrash />
          {confirming && <span>메모의 값도 사라져요</span>}
        </button>
      </div>

      {hasOptions(property.type) && (
        <div className={styles.optionEditor}>
          {property.options.map((o) => (
            <div key={o.id} className={styles.optionRow}>
              <select
                className={`${optionClass(o.color)} ${styles.colorSelect}`}
                value={o.color}
                title="색"
                onChange={(e) =>
                  setOptions(
                    property.options.map((x) =>
                      x.id === o.id
                        ? { ...x, color: e.target.value as MemoOptionColor }
                        : x,
                    ),
                  )
                }
              >
                {memoOptionColors.map((c) => (
                  <option key={c} value={c}>
                    {OPTION_COLOR_LABELS[c]}
                  </option>
                ))}
              </select>
              <CommitInput
                className={styles.fieldInput}
                value={o.name}
                onCommit={(name) =>
                  setOptions(
                    property.options.map((x) =>
                      x.id === o.id ? { ...x, name } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className={styles.iconBtn}
                title="선택지 지우기"
                onClick={() =>
                  setOptions(property.options.filter((x) => x.id !== o.id))
                }
              >
                <IconClose />
              </button>
            </div>
          ))}
          <input
            className={styles.fieldInput}
            value={newName}
            placeholder="선택지 추가 (Enter)"
            maxLength={100}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={addOption}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                addOption();
              }
            }}
          />
        </div>
      )}
    </li>
  );
}

export default function PropertyManager({ onClose }: { onClose: () => void }) {
  const properties = useMemosStore((s) => s.properties);
  const createProperty = useMemosStore((s) => s.createProperty);
  const [name, setName] = useState("");
  const [type, setType] = useState<MemoPropertyType>("text");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    if (await createProperty({ name: n, type })) setName("");
    setBusy(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.manager}
        role="dialog"
        aria-label="속성 관리"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.managerHeader}>
          <h2>속성</h2>
          <button
            type="button"
            className={styles.iconBtn}
            title="닫기"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>
        <p className={styles.managerHint}>
          모든 메모가 같은 속성을 가져요. 종류는 만든 뒤 바꿀 수 없어요.
        </p>

        <ul className={styles.managerList}>
          {properties.map((p) => (
            <PropertyItem key={p.id} property={p} />
          ))}
        </ul>

        <form
          className={styles.managerAdd}
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input
            className={styles.fieldInput}
            value={name}
            placeholder="새 속성 이름"
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className={styles.fieldInput}
            value={type}
            onChange={(e) => setType(e.target.value as MemoPropertyType)}
          >
            {memoPropertyTypes.map((t) => (
              <option key={t} value={t}>
                {PROPERTY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={!name.trim() || busy}
          >
            추가
          </button>
        </form>
      </div>
    </div>
  );
}
