import { describe, expect, it } from "vitest";
import type { MemoProperty, MemoSummary } from "@cali/shared";
import { DEFAULT_SORT, queryMemos } from "./memo-query";

const props: MemoProperty[] = [
  {
    id: 1,
    name: "분류",
    type: "select",
    options: [
      { id: "b", name: "B", color: "blue" },
      { id: "a", name: "A", color: "red" },
    ],
  },
  { id: 2, name: "점수", type: "number", options: [] },
  { id: 3, name: "끝남", type: "checkbox", options: [] },
  { id: 4, name: "날짜", type: "date", options: [] },
  {
    id: 5,
    name: "태그",
    type: "multiSelect",
    options: [
      { id: "x", name: "X", color: "gray" },
      { id: "y", name: "Y", color: "gray" },
    ],
  },
  { id: 6, name: "출처", type: "text", options: [] },
];

const memo = (
  id: number,
  values: MemoSummary["values"],
  over: Partial<MemoSummary> = {},
): MemoSummary => ({
  id,
  title: `메모${id}`,
  values,
  preview: "",
  createdAt: `2026-11-0${id}T00:00:00.000Z`,
  updatedAt: `2026-11-1${id}T00:00:00.000Z`,
  ...over,
});

const memos = [
  memo(1, { 1: "a", 2: 10, 4: "2026-11-01", 5: ["x"], 6: "Book" }),
  memo(2, { 1: "b", 2: 3, 3: true, 4: "2026-11-20", 5: ["x", "y"] }),
  memo(3, {}),
];
const ids = (list: MemoSummary[]) => list.map((m) => m.id);

describe("queryMemos 거르기", () => {
  it("조건이 없으면 최근에 고친 순", () => {
    expect(ids(queryMemos(memos, props, [], DEFAULT_SORT))).toEqual([3, 2, 1]);
  });

  it("종류별 조건, 여러 개면 모두 만족", () => {
    const q = (f: Parameters<typeof queryMemos>[2]) =>
      ids(queryMemos(memos, props, f, DEFAULT_SORT));
    expect(q([{ propertyId: 1, op: "is", value: "a" }])).toEqual([1]);
    expect(q([{ propertyId: 2, op: "gt", value: "5" }])).toEqual([1]);
    expect(q([{ propertyId: 3, op: "is", value: "true" }])).toEqual([2]);
    expect(q([{ propertyId: 3, op: "is", value: "false" }])).toEqual([3, 1]);
    expect(q([{ propertyId: 4, op: "lt", value: "2026-11-10" }])).toEqual([1]);
    expect(q([{ propertyId: 5, op: "contains", value: "y" }])).toEqual([2]);
    expect(q([{ propertyId: 6, op: "contains", value: "boo" }])).toEqual([1]);
    expect(q([{ propertyId: 1, op: "empty" }])).toEqual([3]);
    expect(
      q([
        { propertyId: 5, op: "contains", value: "x" },
        { propertyId: 2, op: "lt", value: "5" },
      ]),
    ).toEqual([2]);
  });

  it("편집 중인 메모는 조건에 안 맞아도 남긴다", () => {
    expect(
      ids(
        queryMemos(
          memos,
          props,
          [{ propertyId: 1, op: "is", value: "a" }],
          DEFAULT_SORT,
          3,
        ),
      ),
    ).toEqual([3, 1]);
  });

  it("값을 아직 안 고른 조건과 지운 속성의 조건은 무시", () => {
    expect(
      ids(
        queryMemos(
          memos,
          props,
          [
            { propertyId: 1, op: "is", value: "" },
            { propertyId: 99, op: "empty" },
          ],
          DEFAULT_SORT,
        ),
      ),
    ).toEqual([3, 2, 1]);
  });
});

describe("queryMemos 정렬", () => {
  it("속성 정렬은 값 없는 메모를 방향과 상관없이 뒤로", () => {
    expect(ids(queryMemos(memos, props, [], { key: 2, dir: "asc" }))).toEqual([
      2, 1, 3,
    ]);
    expect(ids(queryMemos(memos, props, [], { key: 2, dir: "desc" }))).toEqual([
      1, 2, 3,
    ]);
  });

  it("선택은 선택지 순서대로", () => {
    // 선택지 순서: b, a
    expect(ids(queryMemos(memos, props, [], { key: 1, dir: "asc" }))).toEqual([
      2, 1, 3,
    ]);
  });

  it("제목·만든 날", () => {
    const titled = [
      memo(1, {}, { title: "나" }),
      memo(2, {}, { title: "가" }),
      memo(3, {}, { title: "다" }),
      memo(4, {}, { title: "" }),
    ];
    expect(
      ids(queryMemos(titled, props, [], { key: "title", dir: "asc" })),
    ).toEqual([2, 1, 3, 4]);
    expect(
      ids(queryMemos(titled, props, [], { key: "title", dir: "desc" })),
    ).toEqual([3, 1, 2, 4]);
    expect(
      ids(queryMemos(memos, props, [], { key: "createdAt", dir: "asc" })),
    ).toEqual([1, 2, 3]);
  });
});
