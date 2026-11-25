import { useLayoutEffect, useRef, useState } from "react";
import type { MemoProperty, MemoValue } from "@cali/shared";
import { IconNavigate } from "@/components/icons";
import { cleanNumberInput, parseNumberInput } from "@/lib/number-input";
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
      return <TextField value={value} onChange={onChange} />;
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

/**
 * 여러 줄 글. 노션처럼 Enter는 입력 끝내기, Shift+Enter가 줄바꿈.
 * 줄 수만큼 칸이 늘어난다(field-sizing은 Safari 26부터라 높이를 직접 맞춘다).
 */
function TextField({
  value,
  onChange,
}: {
  value: MemoValue | undefined;
  onChange: (value: MemoValue | undefined) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = typeof value === "string" ? value : "";
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`${styles.value} ${styles.textValue}`}
      value={text}
      placeholder="비어 있음"
      maxLength={2000}
      onChange={(e) => onChange(e.target.value || undefined)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * 숫자: 숫자가 아닌 글자는 칸에 안 들어간다. 쓰는 중인 글자("-", "1.")는 칸에만 두고
 * 숫자가 되면 올린다. 칸을 떠날 때 숫자가 아니면 저장된 값으로 되돌린다.
 */
function NumberField({
  value,
  onChange,
}: {
  value: MemoValue | undefined;
  onChange: (value: MemoValue | undefined) => void;
}) {
  const saved = typeof value === "number" ? String(value) : "";
  const [text, setText] = useState(saved);
  return (
    <input
      className={styles.value}
      inputMode="decimal"
      value={text}
      placeholder="비어 있음"
      onChange={(e) => {
        const clean = cleanNumberInput(e.target.value);
        setText(clean);
        if (!clean) onChange(undefined);
        else {
          const n = parseNumberInput(clean);
          if (n !== undefined) onChange(n);
        }
      }}
      onBlur={() => {
        if (text && parseNumberInput(text) === undefined) setText(saved);
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
