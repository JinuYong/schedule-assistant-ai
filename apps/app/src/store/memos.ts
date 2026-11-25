import { create } from "zustand";
import {
  normalizeMemoValues,
  type CreateMemoPropertyBody,
  type Memo,
  type MemoProperty,
  type MemoSummary,
  type MemoValues,
  type UpdateMemoBody,
  type UpdateMemoPropertyBody,
} from "@cali/shared";
import { api, ApiRequestError } from "@/lib/api";
import { MOCK_ENABLED, createMockMemoApi } from "@/lib/dev-mock";
import { useAccountStore } from "./account";
import { showToast } from "./toast";

/** 입력이 멈추고 이만큼 지나면 저장 */
const SAVE_DELAY_MS = 700;
/** 서버가 받기 전의 저장(앱을 꺼도 다음에 다시 보낸다) */
const BACKUP_KEY = "memo.unsaved";

export type MemoSaveState = "idle" | "saving" | "saved" | "error";

interface MemosStore {
  properties: MemoProperty[];
  /** 메모 요약 전부(최근에 고친 순) */
  memos: MemoSummary[];
  isLoading: boolean;
  error: string | null;
  /** 검색어와 그 결과 id. 검색어가 없으면 null(전부) */
  query: string;
  matchIds: number[] | null;
  selectedId: number | null;
  /** 편집 중인 메모(본문 포함). selectedId를 불러오는 동안은 null */
  current: Memo | null;
  saveState: MemoSaveState;

  fetchMemos: () => Promise<void>;
  search: (query: string) => Promise<void>;
  select: (id: number | null) => Promise<void>;
  createMemo: () => Promise<void>;
  /** 편집 중인 메모를 바꾸고 잠시 뒤 저장한다 */
  editCurrent: (patch: {
    title?: string;
    content?: unknown[];
    values?: MemoValues;
  }) => void;
  /** 기다리는 저장을 바로 보낸다(다른 메모로 옮기거나 화면을 떠날 때) */
  flush: () => Promise<void>;
  deleteMemo: (id: number) => Promise<void>;

  createProperty: (body: CreateMemoPropertyBody) => Promise<boolean>;
  updateProperty: (
    id: number,
    body: UpdateMemoPropertyBody,
  ) => Promise<boolean>;
  deleteProperty: (id: number) => Promise<void>;
}

/** 서버 대신 쓸 수 있게 필요한 호출만 모은다. 더미 모드는 메모리 구현 */
const memoApi = MOCK_ENABLED
  ? createMockMemoApi()
  : {
      memos: api.memos,
      memo: api.memo,
      createMemo: api.createMemo,
      updateMemo: api.updateMemo,
      deleteMemo: api.deleteMemo,
      createMemoProperty: api.createMemoProperty,
      updateMemoProperty: api.updateMemoProperty,
      deleteMemoProperty: api.deleteMemoProperty,
    };

function token(): string {
  if (MOCK_ENABLED) return "mock";
  const t = useAccountStore.getState().session?.token;
  if (!t) throw new Error("로그인이 필요합니다");
  return t;
}

function fail(e: unknown, message: string) {
  console.error(`[memos] ${message}`, e);
  if (e instanceof ApiRequestError && e.status === 401) {
    void useAccountStore.getState().refreshMe();
    return;
  }
  showToast(message);
}

const summaryOf = (m: Memo): MemoSummary => ({
  id: m.id,
  title: m.title,
  values: m.values,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
});

/** 고친 메모를 맨 앞으로(최근에 고친 순) */
const upsertFirst = (memos: MemoSummary[], memo: MemoSummary) => [
  memo,
  ...memos.filter((m) => m.id !== memo.id),
];

export const useMemosStore = create<MemosStore>((set, get) => {
  // 저장 대기: 편집 중인 메모의 바뀐 칸을 모아 두다가 입력이 멈추면 보낸다.
  // 보내는 중(inflight)과 대기(pending)는 서버가 받기 전까지 이 기기에도 백업한다
  // — 저장 전에 앱을 끄거나 새로 고쳐도 다음에 메모를 열 때 다시 보낸다.
  type Job = { id: number; patch: UpdateMemoBody };
  let pending: Job | null = null;
  let inflight: Job | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> = Promise.resolve();
  let searchSeq = 0;
  let selectSeq = 0;
  let replayed = false;

  const writeBackup = () => {
    const jobs = [inflight, pending].filter((j): j is Job => j !== null);
    try {
      if (jobs.length) localStorage.setItem(BACKUP_KEY, JSON.stringify(jobs));
      else localStorage.removeItem(BACKUP_KEY);
    } catch {
      // 백업 못 해도 저장은 그대로 간다
    }
  };

  // await 사이에 바뀔 수 있어 좁혀진 타입 대신 함수로 읽는다
  const queued = () => pending;

  const send = async (job: Job) => {
    inflight = job;
    set({ saveState: "saving" });
    try {
      const { memo } = await memoApi.updateMemo(token(), job.id, job.patch);
      inflight = null;
      set((s) => ({
        memos: upsertFirst(s.memos, summaryOf(memo)),
        // 보내는 사이에 더 고친 게 없을 때만 "저장됨"
        saveState: queued() ? s.saveState : "saved",
      }));
    } catch (e) {
      inflight = null;
      if (e instanceof ApiRequestError && e.status === 404) {
        // 그새 지워진 메모 — 보낼 곳이 없다
      } else {
        // 못 보낸 칸은 다음 저장에 다시 싣는다(그 사이 더 고친 칸이 우선)
        const later = queued();
        if (!later || later.id === job.id)
          pending = { id: job.id, patch: { ...job.patch, ...later?.patch } };
        set({ saveState: "error" });
        fail(e, "메모를 저장하지 못했습니다.");
      }
    } finally {
      writeBackup();
    }
  };

  /** 대기 중인 칸을 지금 떼어 내 보낸다(떼는 건 바로, 보내기는 앞 저장이 끝난 뒤 차례로) */
  const flush = () => {
    clearTimeout(timer);
    const job = pending;
    pending = null;
    if (job) saving = saving.then(() => send(job));
    return saving;
  };

  /** 지난번에 못 보낸 저장(백업)을 보낸다. 남의 메모·지운 메모는 404로 버려진다 */
  const replayBackup = async () => {
    let jobs: Job[] = [];
    try {
      jobs = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "[]");
      localStorage.removeItem(BACKUP_KEY);
    } catch {
      return;
    }
    for (const job of Array.isArray(jobs) ? jobs : []) {
      if (typeof job?.id !== "number" || !job.patch) continue;
      try {
        await memoApi.updateMemo(token(), job.id, job.patch);
      } catch (e) {
        console.warn("[memos] 지난 저장 다시 보내기 실패", e);
      }
    }
  };

  return {
    properties: [],
    memos: [],
    isLoading: false,
    error: null,
    query: "",
    matchIds: null,
    selectedId: null,
    current: null,
    saveState: "idle",

    fetchMemos: async () => {
      set({ isLoading: true, error: null });
      try {
        if (!replayed) {
          replayed = true;
          await replayBackup();
        }
        const { properties, memos } = await memoApi.memos(token());
        set({ properties, memos });
      } catch (e) {
        console.error("[memos] 조회 실패", e);
        if (e instanceof ApiRequestError && e.status === 401)
          void useAccountStore.getState().refreshMe();
        set({ error: "메모를 불러오지 못했습니다." });
      } finally {
        set({ isLoading: false });
      }
    },

    search: async (query) => {
      const q = query.trim();
      const seq = ++searchSeq;
      set({ query });
      if (!q) {
        set({ matchIds: null });
        return;
      }
      await flush(); // 방금 쓴 글자도 찾히게
      try {
        const { memos } = await memoApi.memos(token(), q);
        if (seq === searchSeq) set({ matchIds: memos.map((m) => m.id) });
      } catch (e) {
        if (seq === searchSeq) fail(e, "검색하지 못했습니다.");
      }
    },

    select: async (id) => {
      if (id === get().selectedId) return;
      const seq = ++selectSeq;
      void flush();
      set({ selectedId: id, current: null, saveState: "idle" });
      if (id === null) return;
      try {
        const { memo } = await memoApi.memo(token(), id);
        if (seq === selectSeq) set({ current: memo });
      } catch (e) {
        if (seq !== selectSeq) return;
        set({ selectedId: null });
        fail(e, "메모를 열지 못했습니다.");
      }
    },

    createMemo: async () => {
      await flush();
      try {
        const { memo } = await memoApi.createMemo(token(), {});
        ++selectSeq;
        set((s) => ({
          memos: upsertFirst(s.memos, summaryOf(memo)),
          // 검색 중이면 새 메모도 보이게
          matchIds: s.matchIds ? [memo.id, ...s.matchIds] : null,
          selectedId: memo.id,
          current: memo,
          saveState: "idle",
        }));
      } catch (e) {
        fail(e, "메모를 만들지 못했습니다.");
      }
    },

    editCurrent: (patch) => {
      const current = get().current;
      if (!current) return;
      const next = { ...current, ...patch };
      set((s) => ({
        current: next,
        // 목록에도 바로(제목·속성). 순서와 미리보기는 저장 응답에서
        memos: s.memos.map((m) =>
          m.id === next.id
            ? { ...m, title: next.title, values: next.values }
            : m,
        ),
      }));
      if (pending && pending.id !== current.id) void flush();
      pending = {
        id: current.id,
        patch: { ...(pending?.patch ?? {}), ...patch },
      };
      writeBackup();
      set({ saveState: "saving" });
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },

    flush,

    deleteMemo: async (id) => {
      if (pending?.id === id) {
        clearTimeout(timer);
        pending = null;
        writeBackup();
      }
      const before = get();
      set((s) => ({
        memos: s.memos.filter((m) => m.id !== id),
        matchIds: s.matchIds?.filter((m) => m !== id) ?? null,
        ...(s.selectedId === id
          ? { selectedId: null, current: null, saveState: "idle" as const }
          : {}),
      }));
      try {
        await memoApi.deleteMemo(token(), id);
      } catch (e) {
        set({ memos: before.memos, matchIds: before.matchIds });
        fail(e, "메모를 지우지 못했습니다.");
      }
    },

    createProperty: async (body) => {
      try {
        const { property } = await memoApi.createMemoProperty(token(), body);
        set((s) => ({ properties: [...s.properties, property] }));
        return true;
      } catch (e) {
        fail(e, "속성을 추가하지 못했습니다.");
        return false;
      }
    },

    updateProperty: async (id, body) => {
      try {
        const { property } = await memoApi.updateMemoProperty(
          token(),
          id,
          body,
        );
        set((s) => {
          const properties = s.properties.map((p) =>
            p.id === id ? property : p,
          );
          // 지운 선택지의 값이 남아 보이지 않게
          const clean = <T extends { values: MemoValues }>(m: T): T => ({
            ...m,
            values: normalizeMemoValues(properties, m.values),
          });
          return {
            properties,
            memos: s.memos.map(clean),
            current: s.current && clean(s.current),
          };
        });
        return true;
      } catch (e) {
        fail(e, "속성을 고치지 못했습니다.");
        return false;
      }
    },

    deleteProperty: async (id) => {
      const before = get().properties;
      set((s) => {
        const properties = s.properties.filter((p) => p.id !== id);
        const clean = <T extends { values: MemoValues }>(m: T): T => ({
          ...m,
          values: normalizeMemoValues(properties, m.values),
        });
        return {
          properties,
          memos: s.memos.map(clean),
          current: s.current && clean(s.current),
        };
      });
      try {
        await memoApi.deleteMemoProperty(token(), id);
      } catch (e) {
        set({ properties: before });
        fail(e, "속성을 지우지 못했습니다.");
        await get().fetchMemos();
      }
    },
  };
});
