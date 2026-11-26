import { describe, expect, it } from "vitest";
import { CANCELLED_REPLY, runAgent, type ToolImpl } from "./agent";
import type { AiMessage, AiProvider } from "./types";

/** 정해 둔 답을 차례로 주는 가짜 공급자. 받은 기록도 남긴다 */
function scripted(...replies: AiMessage[]) {
  const seen: AiMessage[][] = [];
  const provider: AiProvider = {
    id: "fake",
    async generate(req) {
      seen.push([...req.messages]);
      const r = replies.shift();
      if (!r) throw new Error("답이 더 없음");
      for (const p of r.parts) if (p.type === "text") req.onText?.(p.text);
      return r;
    },
  };
  return { provider, seen };
}

const say = (text: string): AiMessage => ({
  role: "assistant",
  parts: [{ type: "text", text }],
});
const call = (
  name: string,
  args: Record<string, unknown> = {},
  id = "c1",
): AiMessage => ({
  role: "assistant",
  parts: [{ type: "tool_call", id, name, args }],
});
const userSays = (text: string): AiMessage => ({
  role: "user",
  parts: [{ type: "text", text }],
});

function tool(name: string, over: Partial<ToolImpl> = {}): ToolImpl {
  return {
    spec: { name, description: name, parameters: { type: "object" } },
    run: async () => ({ ok: true }),
    ...over,
  };
}

describe("runAgent", () => {
  it("도구 없이 답만 하면 한 번에 끝", async () => {
    const { provider } = scripted(say("안녕하세요"));
    const log: AiMessage[] = [];
    const r = await runAgent({
      provider,
      system: "",
      history: [userSays("hi")],
      append: (m) => log.push(m),
      tools: [],
      confirm: async () => true,
    });
    expect(r).toEqual({
      reply: "안녕하세요",
      actions: [],
      mutated: false,
      cancelled: false,
    });
    expect(log).toHaveLength(1);
  });

  it("도구를 실행해 결과를 돌려주고, 다음 답으로 끝낸다", async () => {
    const { provider, seen } = scripted(
      call("create_event", { title: "치과" }),
      say("추가했어요"),
    );
    const log: AiMessage[] = [];
    const r = await runAgent({
      provider,
      system: "",
      history: [userSays("치과")],
      append: (m) => log.push(m),
      tools: [
        tool("create_event", {
          run: async (a) => ({ id: "e1", title: a.title }),
          describe: (a) => `추가: ${a.title}`,
          mutates: true,
        }),
      ],
      confirm: async () => true,
    });
    expect(r.reply).toBe("추가했어요");
    expect(r.mutated).toBe(true);
    expect(r.actions).toEqual([
      { tool: "create_event", ok: true, text: "추가: 치과" },
    ]);
    // 두 번째 요청엔 도구 결과가 붙어 있다
    expect(seen[1].at(-1)).toEqual({
      role: "user",
      parts: [
        {
          type: "tool_result",
          id: "c1",
          name: "create_event",
          result: { id: "e1", title: "치과" },
        },
      ],
    });
    expect(log.map((m) => m.role)).toEqual(["assistant", "user", "assistant"]);
  });

  it("확인에서 거절하면 실행하지 않고 바로 끝낸다(기록은 짝을 맞춘다)", async () => {
    const { provider, seen } = scripted(call("delete_event", { id: "e1" }));
    let ran = false;
    const log: AiMessage[] = [];
    const r = await runAgent({
      provider,
      system: "",
      history: [userSays("지워")],
      append: (m) => log.push(m),
      tools: [
        tool("delete_event", {
          confirm: () => "지울까요?",
          run: async () => {
            ran = true;
          },
        }),
      ],
      confirm: async (q) => {
        expect(q).toBe("지울까요?");
        return false;
      },
    });
    expect(ran).toBe(false);
    expect(r.cancelled).toBe(true);
    expect(r.reply).toBe(CANCELLED_REPLY);
    expect(seen).toHaveLength(1); // 모델에 다시 묻지 않는다
    expect(log.map((m) => m.role)).toEqual(["assistant", "user", "assistant"]);
  });

  it("도구가 실패하면 오류를 결과로 돌려주고 계속한다", async () => {
    const { provider, seen } = scripted(
      call("create_event"),
      say("실패했어요"),
    );
    const r = await runAgent({
      provider,
      system: "",
      history: [userSays("x")],
      append: () => {},
      tools: [
        tool("create_event", {
          run: async () => {
            throw new Error("권한 없음");
          },
        }),
      ],
      confirm: async () => true,
    });
    expect(r.actions).toEqual([
      { tool: "create_event", ok: false, text: "권한 없음" },
    ]);
    expect(seen[1].at(-1)?.parts[0]).toMatchObject({
      result: { error: "권한 없음" },
    });
  });

  it("없는 도구는 오류 결과", async () => {
    const { provider, seen } = scripted(call("nope"), say("몰라요"));
    await runAgent({
      provider,
      system: "",
      history: [userSays("x")],
      append: () => {},
      tools: [],
      confirm: async () => true,
    });
    expect(seen[1].at(-1)?.parts[0]).toMatchObject({
      result: { error: "없는 도구: nope" },
    });
  });

  it("단계 상한에서 멈춘다", async () => {
    const { provider } = scripted(
      call("a", {}, "1"),
      call("a", {}, "2"),
      call("a", {}, "3"),
    );
    const r = await runAgent({
      provider,
      system: "",
      history: [userSays("x")],
      append: () => {},
      tools: [tool("a")],
      confirm: async () => true,
      maxSteps: 2,
    });
    expect(r.reply).toContain("단계가 너무 많아");
  });

  it("단계 사이 글자는 줄을 바꿔 잇는다", async () => {
    const first: AiMessage = {
      role: "assistant",
      parts: [
        { type: "text", text: "찾아볼게요" },
        { type: "tool_call", id: "c1", name: "a", args: {} },
      ],
    };
    const { provider } = scripted(first, say("없어요"));
    const deltas: string[] = [];
    const r = await runAgent({
      provider,
      system: "",
      history: [userSays("x")],
      append: () => {},
      tools: [tool("a")],
      confirm: async () => true,
      onText: (d) => deltas.push(d),
    });
    expect(deltas.join("")).toBe("찾아볼게요\n없어요");
    expect(r.reply).toBe("찾아볼게요\n없어요");
  });
});
