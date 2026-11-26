import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryCalendar } from "@/lib/ai/memory-calendar";
import { parseKst } from "@/lib/ai/calendar-time";
import type { AiMessage, AiProvider, GenerateRequest } from "@/lib/ai/types";
import {
  configureAi,
  resetAiForTest,
  trimHistory,
  useAiStore,
  waitForEntry,
} from "./ai";

const calendars = [
  { id: "primary", summary: "내 캘린더", primary: true, accessRole: "owner" },
];

/** 요청마다 함수로 답을 만드는 가짜 공급자 */
function fakeProvider(answer: (req: GenerateRequest, n: number) => AiMessage) {
  const seen: GenerateRequest[] = [];
  const provider: AiProvider = {
    id: "fake",
    async generate(req) {
      seen.push({ ...req, messages: [...req.messages] });
      return answer(req, seen.length);
    },
  };
  return { provider, seen };
}

const say = (text: string): AiMessage => ({
  role: "assistant",
  parts: [{ type: "text", text }],
});
const lastUserText = (req: GenerateRequest) => {
  const m = [...req.messages].reverse().find((x) => x.role === "user");
  const p = m?.parts.find((x) => x.type === "text");
  return p?.type === "text" ? p.text : "";
};

let clock = parseKst("2026-11-26T11:00:00");
let mutated = 0;

function configure(
  provider: AiProvider,
  seed: Parameters<typeof createMemoryCalendar>[1] = [],
) {
  const backend = createMemoryCalendar(calendars, seed);
  configureAi({
    provider,
    backend,
    defaultCalendarId: async () => "primary",
    onMutated: () => mutated++,
    now: () => clock,
  });
  return backend;
}

beforeEach(() => {
  resetAiForTest();
  clock = parseKst("2026-11-26T11:00:00");
  mutated = 0;
});

describe("AI 세션", () => {
  it("요청은 줄을 서고, 같은 세션 기록을 이어 쓴다", async () => {
    const { provider, seen } = fakeProvider((req) =>
      say(`답:${lastUserText(req)}`),
    );
    configure(provider);
    const { ask } = useAiStore.getState();
    const a = ask({ text: "하나", origin: "chat" });
    const b = ask({ text: "둘", origin: "floating" });
    const [ea, eb] = [await waitForEntry(a), await waitForEntry(b)];
    expect(ea).toMatchObject({
      status: "done",
      reply: "답:하나",
      origin: "chat",
    });
    expect(eb).toMatchObject({
      status: "done",
      reply: "답:둘",
      origin: "floating",
    });
    // 두 번째 요청엔 첫 대화가 들어 있다
    expect(seen[1].messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(seen[1].system).toContain("2026-11-26(목) 11:00");
  });

  it("도구로 일정을 바꾸면 onMutated", async () => {
    const { provider } = fakeProvider((_req, n) =>
      n === 1
        ? {
            role: "assistant",
            parts: [
              {
                type: "tool_call",
                id: "c",
                name: "create_event",
                args: { title: "치과", start: "2026-11-27T15:00" },
              },
            ],
          }
        : say("추가했어요"),
    );
    const backend = configure(provider);
    const e = await waitForEntry(
      useAiStore.getState().ask({ text: "치과", origin: "schedule" }),
    );
    expect(e.actions).toEqual([
      {
        tool: "create_event",
        ok: true,
        text: "추가 · 치과 · 11/27(금) 15:00~16:00",
      },
    ]);
    expect(e.mutated).toBe(true);
    expect(mutated).toBe(1);
    expect(backend.events()).toHaveLength(1);
  });

  it("확인을 store에 띄우고 답을 기다린다", async () => {
    const seed = [
      {
        id: "g1",
        calendarId: "primary",
        summary: "회의",
        start: { dateTime: "2026-11-30T10:00:00+09:00" },
        end: { dateTime: "2026-11-30T11:00:00+09:00" },
      },
    ];
    const { provider, seen } = fakeProvider((req, n) => {
      if (n === 1) {
        // 고른 일정의 별칭이 메시지 앞에 붙어 온다
        const alias = /\[고른 일정: (e\d+)/.exec(lastUserText(req))![1];
        return {
          role: "assistant",
          parts: [
            {
              type: "tool_call",
              id: "c",
              name: "delete_event",
              args: { id: alias },
            },
          ],
        };
      }
      return say("지웠어요");
    });
    const backend = configure(provider, seed);
    const id = useAiStore.getState().ask({
      text: "삭제",
      origin: "floating",
      target: {
        id: "g1",
        calendarId: "primary",
        title: "회의",
        startTime: "2026-11-30T10:00:00+09:00",
        endTime: "2026-11-30T11:00:00+09:00",
        isAllDay: false,
      },
    });
    expect(useAiStore.getState().entries[0].targetLabel).toBe(
      "회의 · 11/30(월) 10:00~11:00",
    );
    await expect.poll(() => useAiStore.getState().confirm).not.toBeNull();
    const c = useAiStore.getState().confirm!;
    expect(c).toMatchObject({ entryId: id, origin: "floating" });
    expect(c.text).toContain("‘회의’");
    useAiStore.getState().answerConfirm(c.id, true);
    const e = await waitForEntry(id);
    expect(e.reply).toBe("지웠어요");
    expect(backend.events()).toHaveLength(0);
    expect(useAiStore.getState().confirm).toBeNull();
    expect(lastUserText(seen[0])).toMatch(
      /^\[고른 일정: e1 ‘회의’ 11\/30\(월\) 10:00~11:00\]\n삭제$/,
    );
  });

  it("날짜가 바뀌면 새 세션", async () => {
    const { provider, seen } = fakeProvider(() => say("ok"));
    configure(provider);
    const { ask } = useAiStore.getState();
    await waitForEntry(ask({ text: "어제", origin: "chat" }));
    clock = parseKst("2026-11-27T09:00:00");
    await waitForEntry(ask({ text: "오늘", origin: "chat" }));
    expect(seen[1].messages).toHaveLength(1);
    expect(useAiStore.getState().entries.map((e) => e.text)).toEqual(["오늘"]);
  });

  it("공급자 오류는 항목의 error로", async () => {
    configure({
      id: "x",
      generate: async () => {
        throw new Error("키가 없어요");
      },
    });
    const e = await waitForEntry(
      useAiStore.getState().ask({ text: "a", origin: "schedule" }),
    );
    expect(e).toMatchObject({ status: "error", error: "키가 없어요" });
  });

  it("새 대화는 기다리던 확인을 취소한다", async () => {
    const seed = [
      {
        id: "g1",
        calendarId: "primary",
        summary: "a",
        start: { date: "2026-11-27" },
        end: { date: "2026-11-28" },
      },
    ];
    const { provider } = fakeProvider((req) => {
      const alias = /\[고른 일정: (e\d+)/.exec(lastUserText(req))![1];
      return {
        role: "assistant",
        parts: [
          {
            type: "tool_call",
            id: "c",
            name: "delete_event",
            args: { id: alias },
          },
        ],
      };
    });
    configure(provider, seed);
    const id = useAiStore.getState().ask({
      text: "지워",
      origin: "chat",
      target: {
        id: "g1",
        calendarId: "primary",
        title: "a",
        startTime: "2026-11-27",
        endTime: "2026-11-28",
        isAllDay: true,
      },
    });
    await expect.poll(() => useAiStore.getState().confirm).not.toBeNull();
    useAiStore.getState().newSession();
    const e = await waitForEntry(id);
    expect(e.status).toBe("error");
    expect(useAiStore.getState().entries).toEqual([]);
  });
});

describe("trimHistory", () => {
  const u = (t: string): AiMessage => ({
    role: "user",
    parts: [{ type: "text", text: t }],
  });
  const r: AiMessage = {
    role: "user",
    parts: [{ type: "tool_result", id: "1", name: "x", result: 1 }],
  };
  const a = say("a");
  it("상한 안이면 그대로, 넘으면 사용자 말에서 시작", () => {
    const h = [u("1"), a, u("2"), a, r, a];
    expect(trimHistory(h, 10)).toBe(h);
    expect(trimHistory(h, 4)).toEqual([u("2"), a, r, a]);
    expect(trimHistory(h, 3)).toEqual([]);
  });
});
