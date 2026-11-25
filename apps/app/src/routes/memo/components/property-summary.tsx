// 속성 값 요약: "분류 업무 · 태그 급함 나중에 · 날짜 11월 25일"처럼 속성 이름을 앞에 붙여
// 어느 속성의 값인지 구분한다. 메모 목록 항목에 쓴다.

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

/** 한 줄을 다 쓰는 주소라 앞의 https://·www.만 떼고 보여 준다 */
const shortUrl = (url: string) =>
  url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");

/** 값 하나를 짧게. 보여 줄 게 없으면(빈 값·체크 해제) null */
function SummaryValue({
  property,
  value,
}: {
  property: MemoProperty;
  value: MemoValue | undefined;
}) {
  if (value === undefined && property.type !== "checkbox") return null;
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
      // 체크 해제도 빈 네모로 보인다(안 보이면 "해제"인지 "안 보이게 설정"인지 모른다)
      return (
        <span
          className={`${styles.box}${value === true ? ` ${styles.boxOn}` : ""}`}
          role="img"
          aria-label={value === true ? "체크" : "체크 해제"}
        >
          {value === true && <IconCheck size={10} />}
        </span>
      );
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
        <span className={styles.text}>{shortUrl(value)}</span>
      ) : null;
    case "text":
      return typeof value === "string" ? (
        <span className={styles.text}>{value.split("\n")[0]}</span>
      ) : null;
  }
}

/** 길어질 수 있는 값은 한 줄을 다 쓴다(글·다중 선택·URL) */
const isLong = (p: MemoProperty) =>
  p.type === "text" || p.type === "multiSelect" || p.type === "url";

/** 값이 없으면 건너뛴다. 체크박스는 해제(값 없음)도 상태라 늘 보인다 */
const hasShownValue = (p: MemoProperty, v: MemoValue | undefined) =>
  v !== undefined || p.type === "checkbox";

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
  const group = (p: MemoProperty) => (
    <span
      key={p.id}
      className={`${styles.group}${isLong(p) ? ` ${styles.groupLong}` : ""}`}
    >
      <span className={styles.name}>{p.name}</span>
      <SummaryValue property={p} value={values[String(p.id)]} />
    </span>
  );
  // 짧은 값(선택·날짜·숫자·체크)은 한 줄에 모으고, 긴 값은 아래에 한 줄씩
  const short = shown.filter((p) => !isLong(p));
  const long = shown.filter(isLong);
  return (
    <span className={`${styles.summary}${className ? ` ${className}` : ""}`}>
      {short.length > 0 && (
        <span className={styles.shortRow}>{short.map(group)}</span>
      )}
      {long.map(group)}
    </span>
  );
}
