// 에이전트 루프: 모델에 묻고 → 도구 호출이 오면(필요하면 사람에게 확인받고) 실행 → 결과를 돌려주고 → 반복.
// 공급자·도구와 상관없는 순수 로직이라 가짜 공급자로 시험한다.

import {
  AiError,
  messageText,
  toolCalls,
  type AiMessage,
  type AiProvider,
  type ToolSpec,
} from "./types";

export interface ToolImpl<A = Record<string, unknown>> {
  spec: ToolSpec;
  /** 실행 전에 물어볼 문장(수정·삭제). null이면 바로 실행 */
  confirm?: (args: A) => string | null | Promise<string | null>;
  run: (args: A) => Promise<unknown>;
  /** 화면에 남길 한 줄(예: "추가: 치과 11/27 15:00"). 없으면 남기지 않음(조회 등) */
  describe?: (args: A, result: unknown) => string | null;
  /** 일정·할일을 바꾸는 도구 — 끝나면 화면을 새로 고친다 */
  mutates?: boolean;
}

export interface AgentAction {
  tool: string;
  ok: boolean;
  /** describe 결과 또는 실패 이유 */
  text: string;
}

export interface AgentResult {
  reply: string;
  actions: AgentAction[];
  mutated: boolean;
  cancelled: boolean;
}

export const MAX_STEPS = 6;
export const CANCELLED_REPLY = "취소했어요.";

export async function runAgent(opts: {
  provider: AiProvider;
  system: string;
  /** 지금까지 대화(이번 사용자 말 포함). 루프가 새 메시지를 append로 붙인다 */
  history: AiMessage[];
  append: (m: AiMessage) => void;
  tools: ToolImpl[];
  confirm: (text: string) => Promise<boolean>;
  signal?: AbortSignal;
  onText?: (delta: string) => void;
  maxSteps?: number;
}): Promise<AgentResult> {
  const byName = new Map(opts.tools.map((t) => [t.spec.name, t]));
  const specs = opts.tools.map((t) => t.spec);
  const messages = [...opts.history];
  const push = (m: AiMessage) => {
    messages.push(m);
    opts.append(m);
  };
  const texts: string[] = [];
  const actions: AgentAction[] = [];
  let mutated = false;

  for (let step = 0; step < (opts.maxSteps ?? MAX_STEPS); step++) {
    if (opts.signal?.aborted) throw new AiError("취소했어요.", "aborted");
    // 단계 사이 글자는 줄을 바꿔 잇는다
    let started = false;
    const reply = await opts.provider.generate({
      system: opts.system,
      messages,
      tools: specs,
      signal: opts.signal,
      onText: (d) => {
        if (!started && texts.length) opts.onText?.("\n");
        started = true;
        opts.onText?.(d);
      },
    });
    push(reply);
    const text = messageText(reply);
    if (text) texts.push(text);

    const calls = toolCalls(reply);
    if (!calls.length)
      return { reply: texts.join("\n"), actions, mutated, cancelled: false };

    const results: AiMessage = { role: "user", parts: [] };
    let cancelled = false;
    for (const call of calls) {
      const tool = byName.get(call.name);
      if (cancelled) {
        results.parts.push({
          type: "tool_result",
          id: call.id,
          name: call.name,
          result: { error: "사용자가 앞선 작업을 취소해서 실행하지 않았다" },
        });
        continue;
      }
      if (!tool) {
        results.parts.push({
          type: "tool_result",
          id: call.id,
          name: call.name,
          result: { error: `없는 도구: ${call.name}` },
        });
        continue;
      }
      let result: unknown;
      try {
        const question = await tool.confirm?.(call.args);
        if (question && !(await opts.confirm(question))) {
          cancelled = true;
          result = { error: "사용자가 취소했다. 다시 시도하지 말 것" };
        } else {
          result = await tool.run(call.args);
          if (tool.mutates) mutated = true;
          const line = tool.describe?.(call.args, result);
          if (line) actions.push({ tool: call.name, ok: true, text: line });
        }
      } catch (e) {
        if (e instanceof AiError && e.code === "aborted") throw e;
        const message = e instanceof Error ? e.message : String(e);
        result = { error: message };
        actions.push({ tool: call.name, ok: false, text: message });
      }
      results.parts.push({
        type: "tool_result",
        id: call.id,
        name: call.name,
        result,
      });
    }
    push(results);

    if (cancelled) {
      // 모델에 다시 묻지 않고 끝낸다(묻는 사이 다른 걸 해 버리지 않게). 기록은 짝이 맞게 답을 붙인다
      push({
        role: "assistant",
        parts: [{ type: "text", text: CANCELLED_REPLY }],
      });
      opts.onText?.((texts.length ? "\n" : "") + CANCELLED_REPLY);
      texts.push(CANCELLED_REPLY);
      return { reply: texts.join("\n"), actions, mutated, cancelled: true };
    }
  }

  const stop = "단계가 너무 많아 멈췄어요. 나눠서 다시 말해 주세요.";
  push({ role: "assistant", parts: [{ type: "text", text: stop }] });
  texts.push(stop);
  return { reply: texts.join("\n"), actions, mutated, cancelled: false };
}
