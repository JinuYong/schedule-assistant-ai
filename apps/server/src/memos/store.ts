import {
  type Memo,
  type MemoProperty,
  type MemoPropertyType,
  type MemoSelectOption,
  type MemoSummary,
  type MemoValues,
} from "@cali/shared";
import { and, asc, desc, eq, like, or } from "drizzle-orm";
import type { Db } from "../db";
import { memoProperties, memos, type MemoRow } from "../db/schema";

/** 메모 한 건을 통째로 쓸 때의 값. 합치기·평문 추출·값 정리는 routes.ts가 한다 */
export interface MemoInput {
  title: string;
  content: unknown[];
  contentText: string;
  values: MemoValues;
}

/** 메모가 DB에 바라는 것. 모든 메서드가 userId로 주인을 거른다 — 남의 것이면 없는 것처럼(null·false).
 *  테스트는 메모리 구현(memory-store.ts) */
export interface MemoStore {
  properties(userId: number): Promise<MemoProperty[]>;
  createProperty(
    userId: number,
    property: Omit<MemoProperty, "id">,
    now: Date,
  ): Promise<MemoProperty>;
  /** 이름·선택지를 갈아끼운다(종류는 그대로) */
  updateProperty(
    userId: number,
    propertyId: number,
    patch: { name: string; options: MemoSelectOption[] },
  ): Promise<MemoProperty | null>;
  deleteProperty(userId: number, propertyId: number): Promise<boolean>;

  /** 최근에 고친 순. query가 있으면 제목·본문 평문에 들어 있는 것만(대소문자 무시) */
  memos(userId: number, query?: string): Promise<MemoSummary[]>;
  findMemo(userId: number, memoId: number): Promise<Memo | null>;
  insertMemo(userId: number, input: MemoInput, now: Date): Promise<Memo>;
  replaceMemo(
    userId: number,
    memoId: number,
    input: MemoInput,
    now: Date,
  ): Promise<Memo | null>;
  deleteMemo(userId: number, memoId: number): Promise<boolean>;
}

export function toMemo(row: MemoRow): Memo {
  return {
    id: row.id,
    title: row.title,
    values: row.propertyValues ?? {},
    content: row.content ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const memoColumns = (input: MemoInput) => ({
  title: input.title,
  content: input.content,
  contentText: input.contentText,
  propertyValues: input.values,
});

const propertyColumns = {
  id: memoProperties.id,
  name: memoProperties.name,
  type: memoProperties.type,
  options: memoProperties.options,
};

const toProperty = (row: {
  id: number;
  name: string;
  type: MemoPropertyType;
  options: MemoSelectOption[] | null;
}): MemoProperty => ({ ...row, options: row.options ?? [] });

/** LIKE 패턴 안의 %·_·\ 를 글자 그대로 */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function createDbMemoStore(db: Db): MemoStore {
  const find = async (userId: number, memoId: number) => {
    const [row] = await db
      .select()
      .from(memos)
      .where(and(eq(memos.id, memoId), eq(memos.userId, userId)));
    return row ? toMemo(row) : null;
  };
  const findProperty = async (userId: number, propertyId: number) => {
    const [row] = await db
      .select(propertyColumns)
      .from(memoProperties)
      .where(
        and(
          eq(memoProperties.id, propertyId),
          eq(memoProperties.userId, userId),
        ),
      );
    return row ? toProperty(row) : null;
  };

  return {
    async properties(userId) {
      const rows = await db
        .select(propertyColumns)
        .from(memoProperties)
        .where(eq(memoProperties.userId, userId))
        .orderBy(asc(memoProperties.id));
      return rows.map(toProperty);
    },

    async createProperty(userId, property, now) {
      const [created] = await db
        .insert(memoProperties)
        .values({ ...property, userId, createdAt: now })
        .$returningId();
      if (!created) throw new Error("속성 저장 직후 id 없음");
      return { ...property, id: created.id };
    },

    async updateProperty(userId, propertyId, patch) {
      const [res] = await db
        .update(memoProperties)
        .set(patch)
        .where(
          and(
            eq(memoProperties.id, propertyId),
            eq(memoProperties.userId, userId),
          ),
        );
      // FOUND_ROWS라 같은 값으로 고쳐도 affectedRows 1
      return res.affectedRows > 0 ? findProperty(userId, propertyId) : null;
    },

    async deleteProperty(userId, propertyId) {
      const [res] = await db
        .delete(memoProperties)
        .where(
          and(
            eq(memoProperties.id, propertyId),
            eq(memoProperties.userId, userId),
          ),
        );
      return res.affectedRows > 0;
    },

    async memos(userId, query) {
      const pattern = query ? `%${escapeLike(query)}%` : null;
      // utf8mb4 기본 콜레이션(…_ai_ci)이라 LIKE가 대소문자를 무시한다
      const rows = await db
        .select({
          id: memos.id,
          title: memos.title,
          propertyValues: memos.propertyValues,
          createdAt: memos.createdAt,
          updatedAt: memos.updatedAt,
        })
        .from(memos)
        .where(
          and(
            eq(memos.userId, userId),
            pattern
              ? or(like(memos.title, pattern), like(memos.contentText, pattern))
              : undefined,
          ),
        )
        .orderBy(desc(memos.updatedAt), desc(memos.id));
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        values: r.propertyValues ?? {},
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));
    },

    findMemo: find,

    async insertMemo(userId, input, now) {
      const [created] = await db
        .insert(memos)
        .values({
          ...memoColumns(input),
          userId,
          createdAt: now,
          updatedAt: now,
        })
        .$returningId();
      if (!created) throw new Error("메모 저장 직후 id 없음");
      const memo = await find(userId, created.id);
      if (!memo) throw new Error("메모 저장 직후 조회 실패");
      return memo;
    },

    async replaceMemo(userId, memoId, input, now) {
      const [res] = await db
        .update(memos)
        .set({ ...memoColumns(input), updatedAt: now })
        .where(and(eq(memos.id, memoId), eq(memos.userId, userId)));
      return res.affectedRows > 0 ? find(userId, memoId) : null;
    },

    async deleteMemo(userId, memoId) {
      const [res] = await db
        .delete(memos)
        .where(and(eq(memos.id, memoId), eq(memos.userId, userId)));
      return res.affectedRows > 0;
    },
  };
}
