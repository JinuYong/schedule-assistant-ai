import type { MemoProperty, MemoSummary } from "@cali/shared";
import type { MemoRow } from "../db/schema";
import { memoColumns, toMemo, type MemoStore } from "./store";

/** 테스트용 MemoStore. DB 구현(store.ts)과 같은 규칙: 남의 것은 없는 것처럼, 최근에 고친 순 */
export function createMemoryMemoStore(): MemoStore {
  const properties: (MemoProperty & { userId: number })[] = [];
  let rows: MemoRow[] = [];
  let nextId = 1;

  const owned = (userId: number, memoId: number) =>
    rows.find((r) => r.id === memoId && r.userId === userId);
  const ownedProperty = (userId: number, propertyId: number) =>
    properties.find((p) => p.id === propertyId && p.userId === userId);
  const strip = (p: MemoProperty & { userId: number }): MemoProperty => ({
    id: p.id,
    name: p.name,
    type: p.type,
    options: p.options,
  });

  return {
    async properties(userId) {
      return properties.filter((p) => p.userId === userId).map(strip);
    },
    async createProperty(userId, property) {
      const created = { ...property, id: nextId++, userId };
      properties.push(created);
      return strip(created);
    },
    async updateProperty(userId, propertyId, patch) {
      const p = ownedProperty(userId, propertyId);
      if (!p) return null;
      Object.assign(p, patch);
      return strip(p);
    },
    async deleteProperty(userId, propertyId) {
      const i = properties.findIndex(
        (p) => p.id === propertyId && p.userId === userId,
      );
      if (i < 0) return false;
      properties.splice(i, 1);
      return true;
    },

    async memos(userId, query) {
      const q = query?.toLowerCase();
      return rows
        .filter((r) => r.userId === userId)
        .filter(
          (r) =>
            !q ||
            r.title.toLowerCase().includes(q) ||
            r.contentText.toLowerCase().includes(q),
        )
        .toSorted(
          (a, b) =>
            b.updatedAt.getTime() - a.updatedAt.getTime() || b.id - a.id,
        )
        .map((r): MemoSummary => {
          const memo = toMemo(r);
          return {
            id: memo.id,
            title: memo.title,
            values: memo.values,
            createdAt: memo.createdAt,
            updatedAt: memo.updatedAt,
          };
        });
    },
    async findMemo(userId, memoId) {
      const row = owned(userId, memoId);
      return row ? toMemo(row) : null;
    },
    async insertMemo(userId, input, now) {
      const row: MemoRow = {
        id: nextId++,
        userId,
        ...memoColumns(input),
        createdAt: now,
        updatedAt: now,
      };
      rows.push(row);
      return toMemo(row);
    },
    async replaceMemo(userId, memoId, input, now) {
      const row = owned(userId, memoId);
      if (!row) return null;
      Object.assign(row, memoColumns(input), { updatedAt: now });
      return toMemo(row);
    },
    async deleteMemo(userId, memoId) {
      const before = rows.length;
      rows = rows.filter((r) => !(r.id === memoId && r.userId === userId));
      return rows.length < before;
    },
  };
}
