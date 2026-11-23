import type {
  MemoOptionColor,
  MemoPropertyType,
  MemoSelectOption,
} from "@cali/shared";
import styles from "./page.module.css";

export const PROPERTY_TYPE_LABELS: Record<MemoPropertyType, string> = {
  text: "텍스트",
  number: "숫자",
  select: "선택",
  multiSelect: "다중 선택",
  date: "날짜",
  checkbox: "체크박스",
  url: "URL",
};

export const OPTION_COLOR_LABELS: Record<MemoOptionColor, string> = {
  gray: "회색",
  brown: "갈색",
  orange: "주황",
  yellow: "노랑",
  green: "초록",
  blue: "파랑",
  purple: "보라",
  pink: "분홍",
  red: "빨강",
};

/** 선택지 색 칩 클래스 */
export const optionClass = (color: MemoOptionColor) =>
  `${styles.option} ${styles[`option-${color}`] ?? ""}`;

export const hasOptions = (type: MemoPropertyType) =>
  type === "select" || type === "multiSelect";

export const newOption = (
  name: string,
  existing: MemoSelectOption[],
): MemoSelectOption => {
  const colors = Object.keys(OPTION_COLOR_LABELS) as MemoOptionColor[];
  return {
    id: crypto.randomUUID(),
    name,
    // 있는 선택지 수만큼 돌려 가며 색을 고른다
    color: colors[existing.length % colors.length]!,
  };
};
