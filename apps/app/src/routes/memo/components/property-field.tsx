import { useState } from "react";
import type { MemoProperty, MemoValue } from "@cali/shared";
import { IconNavigate } from "@/components/icons";
import { openUrl } from "@/lib/open-url";
import SelectField from "./select-field";
import styles from "./property.module.css";

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
          className={styles.value}
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
        <label className={`${styles.value} ${styles.checkboxCell}`}>
          <input
            className={styles.checkbox}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked || undefined)}
          />
        </label>
      );
    case "select":
    case "multiSelect":
      return (
        <SelectField property={property} value={value} onChange={onChange} />
      );
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
      className={styles.value}
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
        className={styles.value}
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
        className={styles.value}
        readOnly
        value=""
        placeholder="비어 있음"
        onFocus={() => setEditing(true)}
      />
    );
  return (
    <input
      className={styles.value}
      type="date"
      autoFocus={!date}
      value={date}
      onChange={(e) => onChange(e.target.value || undefined)}
      onBlur={() => setEditing(false)}
    />
  );
}
