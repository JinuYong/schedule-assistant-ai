// AI 세션 — 메인 창에서만 돈다. 플로팅·일정 빠른 입력·채팅이 같은 세션(대화 기록·일정 별칭)을 쓰고,
// 요청은 한 줄로 세워 하나씩 처리한다. 화면은 자기 출처(origin)의 항목만 보여 준다.
// 플로팅은 별개 웹뷰라 lib/ai/bridge.ts가 이벤트로 이 store에 부탁한다.

import { create } from "zustand";
import { runAgent, type AgentAction } from "@/lib/ai/agent";
import {
  createCalendarTools,
  createEventRefs,
  type CalendarBackend,
  type EventRefs,
} from "@/lib/ai/calendar-tools";
import { fromGoogleTimes, kstDate, whenLabel } from "@/lib/ai/calendar-time";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { AiError, type AiMessage, type AiProvider } from "@/lib/ai/types";
import { canWriteCalendar } from "@/lib/calendar-access";

export type AiOrigin = "chat" | "schedule" | "floating";

/** 자동완성에서 고른 일정(CalendarEvent에서 필요한 것만) */
export interface AiTarget {
  id: string;
  calendarId?: string;
  title: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  location?: string;
}

export interface AiEntry {
  id: string;
  origin: AiOrigin;
  text: string;
  /** 고른 일정 표시용("팀 회의 · 11/30(월) 10:00~11:00") */
  targetLabel?: string;
  status: "queued" | "running" | "done" | "error";
  reply: string;
  actions: AgentAction[];
  error?: string;
  mutated?: boolean;
}

export interface AiConfirm {
  id: string;
  entryId: string;
  origin: AiOrigin;
  text: string;
}

export interface AiRequest {
  text: string;
  origin: AiOrigin;
  target?: AiTarget;
  /** 플로팅이 미리 정한 id(응답을 그 id로 기다린다) */
  entryId?: string;
}

export interface AiRuntime {
  provider: AiProvider;
  backend: CalendarBackend;
  /** 캘린더 목록 → 기본 캘린더 id */
  defaultCalendarId: (
    calendars: { id: string; accessRole?: string; primary?: boolean }[],
  ) => Promise<string>;
  /** 일정이 바뀐 뒤(화면 새로 고침) */
  onMutated?: () => void;
  now?: () => number;
}

interface AiState {
  entries: AiEntry[];
  confirm: AiConfirm | null;
  /** 채팅 입력 초안(탭을 옮겨도 남게) */
  chatDraft: string;
  setChatDraft: (v: string) => void;
  ask: (req: AiRequest) => string;
  answerConfirm: (id: string, ok: boolean) => void;
  newSession: () => void;
}

/** 대화 기록 상한(메시지 수). 넘으면 앞에서부터 사용자 말 단위로 자른다 */
const HISTORY_MAX = 40;

// ── 세션(직렬화하지 않는 것) ───────────────────────────────
let runtime: AiRuntime | null = null;
let history: AiMessage[] = [];
let refs: EventRefs = createEventRefs();
let sessionDay = "";
let chain: Promise<void> = Promise.resolve();
let abort: AbortController | null = null;
/** 새 대화마다 올린다 — 취소된 요청이 새 세션 기록에 끼어들지 않게 */
let generation = 0;
const confirmWaiters = new Map<string, (ok: boolean) => void>();

export function configureAi(r: AiRuntime | null) {
  runtime = r;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

/** 사용자 말(도구 결과 아닌 것)에서 시작하도록 앞을 자른다 — 도구 호출·결과 짝이 깨지지 않게 */
export function trimHistory(h: AiMessage[], max = HISTORY_MAX): AiMessage[] {
  if (h.length <= max) return h;
  for (let i = h.length - max; i < h.length; i++) {
    const m = h[i];
    if (m.role === "user" && m.parts.some((p) => p.type === "text"))
      return h.slice(i);
  }
  return [];
}

function targetTimes(t: AiTarget) {
  return fromGoogleTimes({
    start: t.isAllDay
      ? { date: t.startTime.slice(0, 10) }
      : { dateTime: t.startTime },
    end: t.isAllDay
      ? { date: t.endTime.slice(0, 10) }
      : { dateTime: t.endTime },
  });
}

function resetSession() {
  generation++;
  abort?.abort();
  abort = null;
  history = [];
  refs = createEventRefs();
  for (const resolve of confirmWaiters.values()) resolve(false);
  confirmWaiters.clear();
}

export const useAiStore = create<AiState>((set, get) => {
  const patch = (id: string, p: Partial<AiEntry>) =>
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...p } : e)),
    }));

  async function process(entry: AiEntry, req: AiRequest) {
    const rt = runtime;
    if (!rt) {
      patch(entry.id, {
        status: "error",
        error: "AI가 아직 준비되지 않았어요. 잠시 뒤 다시 해 주세요.",
      });
      return;
    }
    const now = rt.now?.() ?? Date.now();
    // 날짜가 바뀌면 새 세션(어제 대화의 "내일"이 헷갈리지 않게). 지금 항목만 남긴다
    const today = kstDate(now);
    if (sessionDay && sessionDay !== today) {
      resetSession();
      set((s) => ({ entries: s.entries.filter((e) => e.id === entry.id) }));
    }
    sessionDay = today;

    patch(entry.id, { status: "running" });
    const gen = generation;
    abort = new AbortController();
    const signal = abort.signal;
    try {
      const calendars = await rt.backend.calendars();
      const defaultId = await rt.defaultCalendarId(calendars);
      const writable = calendars.filter(canWriteCalendar);
      const system = buildSystemPrompt({
        now,
        calendars: writable.map((c) => c.summary),
        defaultCalendar:
          calendars.find((c) => c.id === defaultId)?.summary ?? "기본",
      });

      let text = req.text;
      if (req.target) {
        const t = req.target;
        const times = targetTimes(t);
        const alias = refs.add({
          calendarId: t.calendarId ?? defaultId,
          eventId: t.id,
          title: t.title,
          ...times,
          location: t.location,
        });
        text = `[고른 일정: ${alias} ‘${t.title}’ ${whenLabel(times)}]\n${text}`;
      }
      if (signal.aborted) throw new AiError("취소했어요.", "aborted");
      history.push({ role: "user", parts: [{ type: "text", text }] });

      let reply = "";
      const result = await runAgent({
        provider: rt.provider,
        system,
        history: trimHistory(history),
        append: (m) => {
          if (gen === generation) history.push(m);
        },
        tools: createCalendarTools({
          backend: rt.backend,
          refs,
          defaultCalendarId: () => defaultId,
        }),
        signal,
        onText: (d) => {
          reply += d;
          patch(entry.id, { reply });
        },
        confirm: (question) =>
          new Promise<boolean>((resolve) => {
            if (signal.aborted) return resolve(false);
            const id = newId();
            confirmWaiters.set(id, resolve);
            set({
              confirm: {
                id,
                entryId: entry.id,
                origin: entry.origin,
                text: question,
              },
            });
          }),
      });
      if (gen === generation) history = trimHistory(history);
      patch(entry.id, {
        status: "done",
        reply: result.reply,
        actions: result.actions,
        mutated: result.mutated,
      });
      if (result.mutated) rt.onMutated?.();
    } catch (e) {
      const aborted = e instanceof AiError && e.code === "aborted";
      const message =
        e instanceof AiError || e instanceof Error
          ? e.message
          : "AI 요청에 실패했어요.";
      console.error("[ai]", e);
      patch(entry.id, {
        status: "error",
        error: aborted ? "취소했어요." : message,
      });
      // 도구가 일부 실행됐을 수 있으니 화면은 새로 고친다
      rt.onMutated?.();
    } finally {
      if (gen === generation) abort = null;
      if (get().confirm?.entryId === entry.id) set({ confirm: null });
    }
  }

  return {
    entries: [],
    confirm: null,
    chatDraft: "",
    setChatDraft: (v) => set({ chatDraft: v }),

    ask(req) {
      const entry: AiEntry = {
        id: req.entryId ?? newId(),
        origin: req.origin,
        text: req.text,
        targetLabel: req.target
          ? `${req.target.title} · ${whenLabel(targetTimes(req.target))}`
          : undefined,
        status: "queued",
        reply: "",
        actions: [],
      };
      set((s) => ({ entries: [...s.entries, entry] }));
      chain = chain.then(() => process(entry, req));
      return entry.id;
    },

    answerConfirm(id, ok) {
      const resolve = confirmWaiters.get(id);
      confirmWaiters.delete(id);
      if (get().confirm?.id === id) set({ confirm: null });
      resolve?.(ok);
    },

    newSession() {
      resetSession();
      set({ entries: [], confirm: null });
    },
  };
});

/** 항목이 끝날 때까지 기다린다(일정 빠른 입력용) */
export function waitForEntry(id: string): Promise<AiEntry> {
  return new Promise((resolve) => {
    const check = (entries: AiEntry[]) => {
      const e = entries.find((x) => x.id === id);
      if (e && (e.status === "done" || e.status === "error")) {
        unsub();
        resolve(e);
        return true;
      }
      // 새 대화로 항목이 사라짐
      if (!e) {
        unsub();
        resolve({
          id,
          origin: "schedule",
          text: "",
          status: "error",
          reply: "",
          actions: [],
          error: "취소했어요.",
        });
        return true;
      }
      return false;
    };
    const unsub = useAiStore.subscribe((s) => check(s.entries));
    check(useAiStore.getState().entries);
  });
}

/** 시험용: 세션을 처음 상태로 */
export function resetAiForTest() {
  resetSession();
  sessionDay = "";
  chain = Promise.resolve();
  useAiStore.setState({ entries: [], confirm: null, chatDraft: "" });
}
