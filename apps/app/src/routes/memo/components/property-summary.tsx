// 속성 값 요약: "분류 업무 · 태그 급함 나중에 · 날짜 11월 25일"처럼 속성 이름을 앞에 붙여
// 어느 속성의 값인지 구분한다. 목록 항목과 접은 속성 칸이 같이 쓴다.

import type { MemoProperty, MemoValue, MemoValues } from "@cali/shared";
import { IconCheck } from "@/components/icons";
import { optionClass } from "../memo-labels";
import styles from "./property-summary.module.css";

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return y === new Date().getFullYear()
    ? `${m}월 ${d}일`
    : `${y}년 ${m}월 ${d}일`;
}

function host(url: string) {
  try {
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** 값 하나를 짧게. 보여 줄 게 없으면(빈 값·체크 해제) null */
function SummaryValue({
  property,
  value,
}: {
  property: MemoProperty;
  value: MemoValue | undefined;
}) {
  if (value === undefined) return null;
  switch (property.type) {
    case "select":
    case "multiSelect": {
      const ids = Array.isArray(value) ? value : [String(value)];
      const options = property.options.filter((o) => ids.includes(o.id));
      if (!options.length) return null;
      return options.map((o) => (
        <span key={o.id} className={optionClass(o.color)}>
          {o.name}
        </span>
      ));
    }
    case "checkbox":
      return value === true ? (
        <span className={styles.check}>
          <IconCheck size={12} />
        </span>
      ) : null;
    case "number":
      return typeof value === "number" ? (
        <span className={styles.text}>{value.toLocaleString("ko-KR")}</span>
      ) : null;
    case "date":
      return typeof value === "string" ? (
        <span className={styles.text}>{formatDate(value)}</span>
      ) : null;
    case "url":
      return typeof value === "string" ? (
        <span className={styles.text}>{host(value)}</span>
      ) : null;
    case "text":
      return typeof value === "string" ? (
        <span className={`${styles.text} ${styles.long}`}>
          {value.split("\n")[0]}
        </span>
      ) : null;
  }
}

const hasShownValue = (p: MemoProperty, v: MemoValue | undefined) =>
  v !== undefined && !(p.type === "checkbox" && v !== true);

export default function PropertySummary({
  properties,
  values,
  className,
}: {
  /** 보여 줄 속성(이 순서대로). 값이 없는 속성은 건너뛴다 */
  properties: MemoProperty[];
  values: MemoValues;
  className?: string;
}) {
  const shown = properties.filter((p) =>
    hasShownValue(p, values[String(p.id)]),
  );
  if (!shown.length) return null;
  return (
    <span className={`${styles.summary}${className ? ` ${className}` : ""}`}>
      {shown.map((p) => (
        <span key={p.id} className={styles.group}>
          <span className={styles.name}>{p.name}</span>
          <SummaryValue property={p} value={values[String(p.id)]} />
        </span>
      ))}
    </span>
  );
}
