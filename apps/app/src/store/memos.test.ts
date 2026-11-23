import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Memo, UpdateMemoBody } from "@cali/shared";

// 이 기기 저장소(테스트 환경은 node라 없음)
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
});

const updateMemo =
  vi.fn<
    (token: string, id: number, body: UpdateMemoBody) => Promise<unknown>
  >();
const memos = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return {
    ApiRequestError: real.ApiRequestError,
    api: {
      memos: (...a: unknown[]) => memos(...a),
      updateMemo: (t: string, id: number, body: UpdateMemoBody) =>
        updateMemo(t, id, body),
    },
  };
});
vi.mock("./account", () => ({
  useAccountStore: {
    getState: () => ({ session: { token: "t" }, refreshMe: vi.fn() }),
  },
}));
vi.mock("./toast", () => ({ showToast: vi.fn() }));

const { useMemosStore } = await import("./memos");
const { ApiRequestError } = await import("@/lib/api");

const memo = (id: number, over: Partial<Memo> = {}): Memo => ({
  id,
  title: "",
  content: [],
  values: {},
  preview: "",
  createdAt: "2026-11-23T00:00:00.000Z",
  updatedAt: "2026-11-23T00:00:00.000Z",
  ...over,
});

/** 편집 중 메모를 바로 놓는다(서버에서 여는 과정 생략) */
const open = (m: Memo) =>
  useMemosStore.setState({ selectedId: m.id, current: m, memos: [m] });

const BACKUP = "memo.unsaved";

describe("메모 자동 저장", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storage.clear();
    updateMemo.mockReset();
    updateMemo.mockImplementation(async (_t, id, body) => ({
      memo: memo(id, body as Partial<Memo>),
    }));
  });
  afterEach(() => vi.useRealTimers());

  it("입력이 멈추면 바뀐 칸을 모아 한 번 보내고 저장됨", async () => {
    open(memo(1));
    const { editCurrent } = useMemosStore.getState();
    editCurrent({ title: "가" });
    editCurrent({ title: "가나" });
    editCurrent({ values: { 3: true } });
    expect(useMemosStore.getState().saveState).toBe("saving");
    expect(updateMemo).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(700);
    expect(updateMemo).toHaveBeenCalledTimes(1);
    expect(updateMemo).toHaveBeenCalledWith("t", 1, {
      title: "가나",
      values: { 3: true },
    });
    expect(useMemosStore.getState().saveState).toBe("saved");
    expect(storage.has(BACKUP)).toBe(false);
  });

  it("다른 메모로 넘어가도 앞 메모의 변경을 잃지 않는다", async () => {
    open(memo(1));
    useMemosStore.getState().editCurrent({ title: "A" });
    open(memo(2));
    useMemosStore.getState().editCurrent({ title: "B" });
    await vi.advanceTimersByTimeAsync(700);
    expect(updateMemo.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      [1, { title: "A" }],
      [2, { title: "B" }],
    ]);
  });

  it("보내기 실패하면 백업에 남기고, 다음 저장에 다시 싣는다", async () => {
    updateMemo.mockRejectedValueOnce(new TypeError("Load failed"));
    open(memo(1));
    useMemosStore.getState().editCurrent({ title: "첫" });
    await vi.advanceTimersByTimeAsync(700);
    expect(useMemosStore.getState().saveState).toBe("error");
    expect(JSON.parse(storage.get(BACKUP)!)).toEqual([
      { id: 1, patch: { title: "첫" } },
    ]);

    useMemosStore.getState().editCurrent({ values: { 1: "x" } });
    await vi.advanceTimersByTimeAsync(700);
    expect(updateMemo).toHaveBeenLastCalledWith("t", 1, {
      title: "첫",
      values: { 1: "x" },
    });
    expect(storage.has(BACKUP)).toBe(false);
  });

  it("지워진 메모(404)면 다시 보내지 않는다", async () => {
    updateMemo.mockRejectedValueOnce(new ApiRequestError(404, "not_found"));
    open(memo(1));
    useMemosStore.getState().editCurrent({ title: "x" });
    await vi.advanceTimersByTimeAsync(700);
    expect(storage.has(BACKUP)).toBe(false);
    await useMemosStore.getState().flush();
    expect(updateMemo).toHaveBeenCalledTimes(1);
  });
});

describe("지난 저장 다시 보내기", () => {
  it("처음 불러올 때 백업을 보내고 지운다", async () => {
    vi.useRealTimers();
    storage.set(BACKUP, JSON.stringify([{ id: 7, patch: { title: "남은" } }]));
    updateMemo.mockReset();
    updateMemo.mockResolvedValue({ memo: memo(7) });
    memos.mockResolvedValue({ properties: [], memos: [] });
    await useMemosStore.getState().fetchMemos();
    expect(updateMemo).toHaveBeenCalledWith("t", 7, { title: "남은" });
    expect(storage.has(BACKUP)).toBe(false);
    // 두 번째부터는 다시 보내지 않는다
    await useMemosStore.getState().fetchMemos();
    expect(updateMemo).toHaveBeenCalledTimes(1);
  });
});
