import { z } from "zod";

// 메모 = 제목 + BlockNote 본문(블록 JSON) + 사용자 정의 속성 값.
// 속성 정의는 사용자마다 하나(모든 메모가 같은 속성을 가진다), 값은 비워 둘 수 있다.

export const memoPropertyTypes = [
  "text",
  "number",
  "select",
  "multiSelect",
  "date",
  "checkbox",
  "url",
] as const;
export const memoPropertyType = z.enum(memoPropertyTypes);
export type MemoPropertyType = z.infer<typeof memoPropertyType>;

export const memoOptionColors = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;
export const memoOptionColor = z.enum(memoOptionColors);
export type MemoOptionColor = z.infer<typeof memoOptionColor>;

/** 선택·다중 선택의 선택지. id는 앱이 만든다(선택지를 한 번에 고쳐 보내려고) */
export const memoSelectOption = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(100),
  color: memoOptionColor,
});
export type MemoSelectOption = z.infer<typeof memoSelectOption>;

const optionList = z
  .array(memoSelectOption)
  .max(100)
  .refine(
    (o) => new Set(o.map((x) => x.id)).size === o.length,
    "선택지 id 중복",
  );

export interface MemoProperty {
  id: number;
  name: string;
  type: MemoPropertyType;
  /** 선택·다중 선택만 쓴다. 나머지는 빈 배열 */
  options: MemoSelectOption[];
}

/** POST /memo-properties — 종류는 만든 뒤 바꾸지 않는다 */
export const createMemoPropertyBody = z.object({
  name: z.string().trim().min(1).max(100),
  type: memoPropertyType,
  options: optionList.optional(),
});
export type CreateMemoPropertyBody = z.infer<typeof createMemoPropertyBody>;

/** PATCH /memo-properties/:id — 이름·선택지만 */
export const updateMemoPropertyBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  options: optionList.optional(),
});
export type UpdateMemoPropertyBody = z.infer<typeof updateMemoPropertyBody>;

/** 속성 값: 키는 속성 id(문자열). 종류에 맞는지는 normalizeMemoValues가 본다 */
export type MemoValue = string | number | boolean | string[];
export type MemoValues = Record<string, MemoValue>;

/**
 * 속성 정의에 맞춰 값을 정리한다 — 없는 속성·없는 선택지·종류가 안 맞는 값·빈 값은 버린다.
 * 서버는 저장할 때, 앱은 표시할 때 같은 규칙을 쓴다(지운 속성·선택지가 남아 보이지 않게).
 */
export function normalizeMemoValues(
  properties: MemoProperty[],
  values: unknown,
): MemoValues {
  const out: MemoValues = {};
  if (!values || typeof values !== "object" || Array.isArray(values))
    return out;
  const raw = values as Record<string, unknown>;
  for (const p of properties) {
    const v = raw[String(p.id)];
    const clean = cleanValue(p, v);
    if (clean !== undefined) out[String(p.id)] = clean;
  }
  return out;
}

function cleanValue(p: MemoProperty, v: unknown): MemoValue | undefined {
  switch (p.type) {
    case "text":
    case "url": {
      if (typeof v !== "string") return undefined;
      const s = v.trim().slice(0, 2000);
      return s || undefined;
    }
    case "number":
      return typeof v === "number" && Number.isFinite(v) ? v : undefined;
    case "checkbox":
      return v === true ? true : undefined;
    case "date":
      return typeof v === "string" && z.iso.date().safeParse(v).success
        ? v
        : undefined;
    case "select":
      return typeof v === "string" && p.options.some((o) => o.id === v)
        ? v
        : undefined;
    case "multiSelect": {
      if (!Array.isArray(v)) return undefined;
      const ids = p.options.map((o) => o.id).filter((id) => v.includes(id)); // 선택지 순서대로, 중복 없이
      return ids.length ? ids : undefined;
    }
  }
}

/** BlockNote 블록 JSON. 서버는 모양을 따지지 않고 평문만 뽑는다 */
export const memoContent = z.array(z.unknown()).max(5000);

const memoFields = {
  title: z.string().max(500),
  content: memoContent,
  values: z.record(z.string(), z.unknown()),
};

/** POST /memos — 다 생략하면 빈 메모 */
export const createMemoBody = z.object(memoFields).partial();
export type CreateMemoBody = z.infer<typeof createMemoBody>;

/** PATCH /memos/:id — 보낸 칸만 바꾼다. values는 통째로 갈아끼운다 */
export const updateMemoBody = z.object(memoFields).partial();
export type UpdateMemoBody = z.infer<typeof updateMemoBody>;

/** 목록용 요약(본문 JSON 없음) */
export interface MemoSummary {
  id: number;
  title: string;
  values: MemoValues;
  /** 본문 앞부분 평문 */
  preview: string;
  createdAt: string;
  updatedAt: string;
}

export interface Memo extends MemoSummary {
  content: unknown[];
}

/** GET /memos(?q=검색어) — 최근에 고친 순 */
export interface MemosResponse {
  properties: MemoProperty[];
  memos: MemoSummary[];
}

export interface MemoResponse {
  memo: Memo;
}

export interface MemoPropertyResponse {
  property: MemoProperty;
}

export const MEMO_PREVIEW_LENGTH = 120;

/**
 * BlockNote 블록에서 평문을 뽑는다(검색·미리보기용). 블록 하나가 한 줄.
 * 글자는 인라인 내용의 `text`에만 있고, 하위 블록은 `children`, 표는 `content.rows[].cells[]`에 있다.
 */
export function extractMemoText(blocks: unknown): string {
  const lines: string[] = [];
  const inline = (node: unknown): string => {
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(inline).join("");
    if (!node || typeof node !== "object") return "";
    const n = node as Record<string, unknown>;
    if (typeof n.text === "string") return n.text;
    if (Array.isArray(n.rows))
      return n.rows
        .map((r) =>
          Array.isArray((r as { cells?: unknown }).cells)
            ? (r as { cells: unknown[] }).cells.map(inline).join(" ")
            : "",
        )
        .join(" ");
    return inline(n.content);
  };
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const b of list) {
      if (!b || typeof b !== "object") continue;
      const block = b as Record<string, unknown>;
      const line = inline(block.content).trim();
      if (line) lines.push(line);
      walk(block.children);
    }
  };
  walk(blocks);
  return lines.join("\n");
}
