// 메모 목록 거르기·정렬 — 목록 응답에 속성 값이 다 있어 앱에서 한다(검색만 서버).

import type {
  MemoProperty,
  MemoPropertyType,
  MemoSummary,
  MemoValue,
} from "@cali/shared";

export type FilterOp =
  | "contains" // 텍스트·URL: 글자 포함 / 다중 선택: 선택지 포함
  | "is" // 선택: 선택지 / 체크박스: 체크·체크 해제 / 날짜·숫자: 같음
  | "gt" // 숫자: 큼 / 날짜: 뒤
  | "lt" // 숫자: 작음 / 날짜: 앞
  | "empty"
  | "notEmpty";

export interface MemoFilter {
  propertyId: number;
  op: FilterOp;
  /** empty·notEmpty는 없음. 체크박스는 "true"/"false", 숫자는 문자열로 들고 있다(입력 중 값) */
  value?: string;
}

export type SortKey = "updatedAt" | "createdAt" | "title" | number;

export interface MemoSort {
  key: SortKey;
  dir: "asc" | "desc";
}

export const DEFAULT_SORT: MemoSort = { key: "updatedAt", dir: "desc" };

/** 속성 종류마다 고를 수 있는 조건(맨 앞이 기본) */
export const FILTER_OPS: Record<MemoPropertyType, FilterOp[]> = {
  text: ["contains", "empty", "notEmpty"],
  url: ["contains", "empty", "notEmpty"],
  number: ["is", "gt", "lt", "empty", "notEmpty"],
  select: ["is", "empty", "notEmpty"],
  multiSelect: ["contains", "empty", "notEmpty"],
  date: ["is", "gt", "lt", "empty", "notEmpty"],
  checkbox: ["is"],
};

export function filterOpLabel(type: MemoPropertyType, op: FilterOp): string {
  switch (op) {
    case "contains":
      return "포함";
    case "is":
      return "같음";
    case "gt":
      return type === "date" ? "이후" : "보다 큼";
    case "lt":
      return type === "date" ? "이전" : "보다 작음";
    case "empty":
      return "비어 있음";
    case "notEmpty":
      return "값 있음";
  }
}

/** 값 칸이 필요한 조건인지 */
export const filterNeedsValue = (op: FilterOp) =>
  op !== "empty" && op !== "notEmpty";

/** 아직 값을 고르지 않은 조건은 거르지 않는다(입력 중) */
const isActive = (f: MemoFilter) =>
  !filterNeedsValue(f.op) || (f.value !== undefined && f.value !== "");

function matches(
  property: MemoProperty,
  value: MemoValue | undefined,
  f: MemoFilter,
): boolean {
  if (f.op === "empty") return value === undefined;
  if (f.op === "notEmpty") return value !== undefined;
  const want = f.value ?? "";
  switch (property.type) {
    case "checkbox":
      return (value === true) === (want === "true");
    case "text":
    case "url":
      return (
        typeof value === "string" &&
        value.toLowerCase().includes(want.toLowerCase())
      );
    case "select":
      return value === want;
    case "multiSelect":
      return Array.isArray(value) && value.includes(want);
    case "number": {
      const n = Number(want);
      if (typeof value !== "number" || !Number.isFinite(n)) return false;
      return f.op === "gt"
        ? value > n
        : f.op === "lt"
          ? value < n
          : value === n;
    }
    case "date": {
      if (typeof value !== "string") return false;
      return f.op === "gt"
        ? value > want
        : f.op === "lt"
          ? value < want
          : value === want;
    }
  }
}

/** 정렬용 값. 선택은 선택지 순서, 다중 선택은 첫 선택지 순서 */
function sortValue(
  property: MemoProperty,
  value: MemoValue | undefined,
): string | number | undefined {
  if (value === undefined) return undefined;
  switch (property.type) {
    case "select":
      return property.options.findIndex((o) => o.id === value);
    case "multiSelect":
      return Array.isArray(value)
        ? property.options.findIndex((o) => o.id === value[0])
        : undefined;
    case "checkbox":
      return value === true ? 1 : 0;
    default:
      return typeof value === "number" || typeof value === "string"
        ? value
        : undefined;
  }
}

const compare = (a: string | number, b: string | number) =>
  typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b), "ko");

/**
 * 조건(모두 만족)으로 거르고 정렬한다. 속성·제목 정렬에서 값이 없는 메모는 방향과 상관없이 뒤로.
 * 지운 속성을 가리키는 조건·정렬은 무시한다.
 */
export function queryMemos(
  memos: MemoSummary[],
  properties: MemoProperty[],
  filters: MemoFilter[],
  sort: MemoSort,
  /** 조건에 안 맞아도 남길 메모(거르기를 건 뒤 만들거나 고친 것 — 고치는 사이 목록에서 사라지지 않게) */
  keepId?: number | null,
): MemoSummary[] {
  const byId = new Map(properties.map((p) => [p.id, p]));
  const active = filters.filter((f) => byId.has(f.propertyId) && isActive(f));
  const filtered = memos.filter(
    (m) =>
      m.id === keepId ||
      active.every((f) =>
        matches(byId.get(f.propertyId)!, m.values[String(f.propertyId)], f),
      ),
  );

  const sign = sort.dir === "asc" ? 1 : -1;
  const sortProperty =
    typeof sort.key === "number" ? byId.get(sort.key) : undefined;
  const key = (m: MemoSummary): string | number | undefined => {
    if (sort.key === "title") return m.title || undefined; // 제목 없는 메모는 뒤로
    if (sort.key === "createdAt") return m.createdAt;
    if (sort.key === "updatedAt" || !sortProperty) return m.updatedAt;
    return sortValue(sortProperty, m.values[String(sortProperty.id)]);
  };
  return filtered.toSorted((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === undefined || kb === undefined)
      return ka === kb ? b.id - a.id : ka === undefined ? 1 : -1;
    return sign * compare(ka, kb) || b.id - a.id;
  });
}
