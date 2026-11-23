import { useState } from "react";
import type { MemoProperty, MemoValue } from "@cali/shared";
import { IconNavigate } from "@/components/icons";
import { openUrl } from "@/lib/open-url";
import { optionClass } from "../memo-labels";
import styles from "../page.module.css";

/** 속성 하나의 값 입력. 비우면 undefined(값 없음) */
export default function PropertyField({
  property,
  value,
  onChange,
}: {
  property: MemoProperty;
  value: MemoValue | undefined;
  onChange: (value: MemoValue | undefined) => void;
}) {
  switch (property.type) {
    case "text":
      return (
        <input
          className={styles.fieldInput}
          value={typeof value === "string" ? value : ""}
          placeholder="비어 있음"
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );
    case "url":
      return <UrlField value={value} onChange={onChange} />;
    case "number":
      return <NumberField value={value} onChange={onChange} />;
    case "date":
      return <DateField value={value} onChange={onChange} />;
    case "checkbox":
      return (
        <input
          className={styles.fieldCheckbox}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked || undefined)}
        />
      );
    case "select":
    case "multiSelect": {
      const selected = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? [value]
          : [];
      if (property.options.length === 0)
        return <span className={styles.fieldEmpty}>선택지 없음</span>;
      return (
        <div className={styles.optionPicker}>
          {property.options.map((o) => {
            const on = selected.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                className={`${optionClass(o.color)}${on ? "" : ` ${styles.optionOff}`}`}
                onClick={() => {
                  if (property.type === "select")
                    return onChange(on ? undefined : o.id);
                  const next = on
                    ? selected.filter((id) => id !== o.id)
                    : [...selected, o.id];
                  onChange(next.length ? next : undefined);
                }}
              >
                {o.name}
              </button>
            );
          })}
        </div>
      );
    }
  }
}

/** 숫자는 입력 중 글자("1.", "-")를 들고 있다가 숫자가 되면 올린다 */
function NumberField({
  value,
  onChange,
}: {
  value: MemoValue | undefined;
  onChange: (value: MemoValue | undefined) => void;
}) {
  const [text, setText] = useState(
    typeof value === "number" ? String(value) : "",
  );
  return (
    <input
      className={styles.fieldInput}
      inputMode="decimal"
      value={text}
      placeholder="비어 있음"
      onChange={(e) => {
        setText(e.target.value);
        const raw = e.target.value.trim();
        const n = Number(raw);
        if (!raw) onChange(undefined);
        else if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

function UrlField({
  value,
  onChange,
}: {
  value: MemoValue | undefined;
  onChange: (value: MemoValue | undefined) => void;
}) {
  const url = typeof value === "string" ? value : "";
  const href = /^https?:\/\//i.test(url) ? url : url ? `https://${url}` : "";
  return (
    <div className={styles.urlField}>
      <input
        className={styles.fieldInput}
        type="url"
        value={url}
        placeholder="비어 있음"
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      {href && (
        <button
          type="button"
          className={styles.iconBtn}
          title="브라우저에서 열기"
          onClick={() => void openUrl(href)}
        >
          <IconNavigate />
        </button>
      )}
    </div>
  );
}

/** WebKit은 빈 날짜 칸에 오늘 날짜를 그려서, 비어 있으면 글자 칸으로 두고 누르면 날짜 칸으로 바꾼다 */
function DateField({
  value,
  onChange,
}: {
  value: MemoValue | undefined;
  onChange: (value: MemoValue | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const date = typeof value === "string" ? value : "";
  if (!date && !editing)
    return (
      <input
        className={styles.fieldInput}
        readOnly
        value=""
        placeholder="비어 있음"
        onFocus={() => setEditing(true)}
      />
    );
  return (
    <input
      className={styles.fieldInput}
      type="date"
      autoFocus={!date}
      value={date}
      onChange={(e) => onChange(e.target.value || undefined)}
      onBlur={() => setEditing(false)}
    />
  );
}
