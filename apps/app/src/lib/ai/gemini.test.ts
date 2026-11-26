import { describe, expect, it } from "vitest";
import {
  createGeminiProvider,
  fromGeminiParts,
  geminiError,
  toGeminiContents,
} from "./gemini";
import { AiError, type AiMessage } from "./types";

const sse = (...chunks: unknown[]) =>
  new Response(
    chunks.map((c) => `data: ${JSON.stringify(c)}\r\n\r\n`).join(""),
    {
      headers: { "content-type": "text/event-stream" },
    },
  );

const chunk = (parts: unknown[], finishReason?: string) => ({
  candidates: [{ content: { role: "model", parts }, finishReason }],
});

describe("toGeminiContents", () => {
  it("Gemini 원본이 있으면 그대로(서명 보존)", () => {
    const raw = {
      role: "model",
      parts: [
        { functionCall: { name: "x", args: {} }, thoughtSignature: "sig" },
      ],
    };
    const m: AiMessage = {
      role: "assistant",
      parts: [{ type: "tool_call", id: "local_0", name: "x", args: {} }],
      raw: { provider: "gemini", content: raw },
    };
    expect(toGeminiContents([m])).toEqual([raw]);
  });

  it("중립 형식을 바꾸고, 우리가 지은 id는 빼고, 객체 아닌 결과는 감싼다", () => {
    const contents = toGeminiContents([
      { role: "user", parts: [{ type: "text", text: "안녕" }] },
      {
        role: "assistant",
        parts: [
          { type: "tool_call", id: "local_0", name: "list", args: { a: 1 } },
        ],
      },
      {
        role: "user",
        parts: [
          { type: "tool_result", id: "local_0", name: "list", result: [1] },
        ],
      },
    ]);
    expect(contents).toEqual([
      { role: "user", parts: [{ text: "안녕" }] },
      {
        role: "model",
        parts: [
          { functionCall: { id: undefined, name: "list", args: { a: 1 } } },
        ],
      },
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              id: undefined,
              name: "list",
              response: { result: [1] },
            },
          },
        ],
      },
    ]);
  });

  it("사용자 쪽이 연달아 오면 합친다", () => {
    const contents = toGeminiContents([
      { role: "user", parts: [{ type: "text", text: "a" }] },
      { role: "user", parts: [{ type: "text", text: "b" }] },
    ]);
    expect(contents).toEqual([
      { role: "user", parts: [{ text: "a" }, { text: "b" }] },
    ]);
  });
});

describe("fromGeminiParts", () => {
  it("글자 조각은 합치고, 생각 파트는 버리고, 함수 호출에 id를 붙인다", () => {
    const m = fromGeminiParts([
      { text: "생각", thought: true },
      { text: "추가" },
      { text: "할게요" },
      {
        functionCall: { name: "create", args: { t: 1 } },
        thoughtSignature: "s",
      },
    ]);
    expect(m.parts).toEqual([
      { type: "text", text: "추가할게요" },
      { type: "tool_call", id: "local_0", name: "create", args: { t: 1 } },
    ]);
    // 원본엔 서명이 남는다
    expect(JSON.stringify(m.raw)).toContain('"thoughtSignature":"s"');
  });

  it("Gemini가 준 호출 id는 그대로", () => {
    const m = fromGeminiParts([{ functionCall: { id: "abc", name: "x" } }]);
    expect(m.parts[0]).toMatchObject({ id: "abc", args: {} });
  });
});

describe("geminiError", () => {
  it("상태별 코드", () => {
    expect(geminiError(429, "").code).toBe("rate_limited");
    expect(geminiError(400, "API key not valid").code).toBe("bad_key");
    expect(geminiError(403, "").code).toBe("bad_key");
    expect(geminiError(503, "").code).toBe("overloaded");
    expect(geminiError(400, "bad").code).toBe("bad_response");
  });
});

describe("createGeminiProvider", () => {
  const req = {
    system: "s",
    messages: [
      { role: "user" as const, parts: [{ type: "text" as const, text: "q" }] },
    ],
    tools: [],
  };

  it("키가 없으면 no_key", async () => {
    const p = createGeminiProvider({
      getKey: async () => null,
      fetch: async () => sse(),
    });
    await expect(p.generate(req)).rejects.toMatchObject({ code: "no_key" });
  });

  it("스트림을 이어 붙이고 글자를 흘려보낸다, 키는 헤더로", async () => {
    let seen: Request | undefined;
    const p = createGeminiProvider({
      getKey: async () => "k",
      fetch: async (url, init) => {
        seen = new Request(url as string, init);
        return sse(chunk([{ text: "안" }]), chunk([{ text: "녕" }], "STOP"));
      },
    });
    const deltas: string[] = [];
    const m = await p.generate({ ...req, onText: (d) => deltas.push(d) });
    expect(m.parts).toEqual([{ type: "text", text: "안녕" }]);
    expect(deltas).toEqual(["안", "녕"]);
    expect(seen!.headers.get("x-goog-api-key")).toBe("k");
    expect(seen!.url).toContain(":streamGenerateContent?alt=sse");
    expect(seen!.url).not.toContain("k&");
  });

  it("503이면 한 번 다시 한다", async () => {
    let calls = 0;
    const p = createGeminiProvider({
      getKey: async () => "k",
      fetch: async () => {
        calls++;
        return calls === 1
          ? Response.json({ error: { message: "busy" } }, { status: 503 })
          : sse(chunk([{ text: "ok" }], "STOP"));
      },
    });
    const m = await p.generate(req);
    expect(calls).toBe(2);
    expect(m.parts[0]).toEqual({ type: "text", text: "ok" });
  }, 5000);

  it("빈 답·차단은 오류", async () => {
    const p = createGeminiProvider({
      getKey: async () => "k",
      fetch: async () => sse({ promptFeedback: { blockReason: "SAFETY" } }),
    });
    const err = await p.generate(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).message).toContain("SAFETY");
  });
});
