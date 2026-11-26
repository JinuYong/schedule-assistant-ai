// Gemini 어댑터. 웹뷰에서 바로 부른다(CORS가 tauri://localhost를 허용, 2026-11-26 확인).
// 문서: https://ai.google.dev/api/generate-content

import {
  AiError,
  type AiMessage,
  type AiPart,
  type AiProvider,
  type GenerateRequest,
} from "./types";

/** 2026-11-26 실측: 도구 호출 3/3 정답, 요청당 2~6초. 3.8-flash·3.1-flash-lite는 503 과부하 */
export const GEMINI_MODEL = "gemini-3.5-flash-lite";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 1500;

interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: unknown };
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

const PROVIDER = "gemini";
/** 우리가 지어 준 호출 id(Gemini가 id를 안 줬을 때) — 다시 보낼 땐 빼야 한다 */
const LOCAL_ID = "local_";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * 중립 메시지 → Gemini contents. 같은 공급자가 준 원본이 있으면 그대로(서명 보존).
 * 사용자 쪽이 연달아 오면(앞 요청이 실패해 답 없이 끝난 경우) 하나로 합친다.
 */
export function toGeminiContents(messages: AiMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const c of messages.map(toContent)) {
    const last = out[out.length - 1];
    if (last?.role === "user" && c.role === "user")
      out[out.length - 1] = {
        role: "user",
        parts: [...last.parts, ...c.parts],
      };
    else out.push(c);
  }
  return out;
}

function toContent(m: AiMessage): GeminiContent {
  if (m.raw?.provider === PROVIDER) return m.raw.content as GeminiContent;
  return {
    role: m.role === "assistant" ? "model" : "user",
    parts: m.parts.map((p): GeminiPart => {
      if (p.type === "text") return { text: p.text };
      const id = p.id.startsWith(LOCAL_ID) ? undefined : p.id;
      if (p.type === "tool_call")
        return { functionCall: { id, name: p.name, args: p.args } };
      return {
        functionResponse: {
          id,
          name: p.name,
          // response는 객체여야 한다
          response: isPlainObject(p.result) ? p.result : { result: p.result },
        },
      };
    }),
  };
}

/** Gemini 응답 파트(스트림 조각을 이어 붙인 것) → 중립 메시지 */
export function fromGeminiParts(parts: GeminiPart[]): AiMessage {
  // 서명 없는 글자 조각은 하나로 합친다(스트림이 잘게 쪼개 보냄). 서명 붙은 파트는 그대로 둔다
  const merged: GeminiPart[] = [];
  for (const p of parts) {
    const last = merged[merged.length - 1];
    const plainText = (x?: GeminiPart) =>
      !!x &&
      typeof x.text === "string" &&
      !x.thought &&
      !x.thoughtSignature &&
      !x.functionCall;
    if (plainText(p) && plainText(last)) last.text += p.text!;
    else merged.push({ ...p });
  }

  let n = 0;
  const out: AiPart[] = [];
  for (const p of merged) {
    if (p.functionCall) {
      out.push({
        type: "tool_call",
        id: p.functionCall.id ?? `${LOCAL_ID}${n++}`,
        name: p.functionCall.name,
        args: p.functionCall.args ?? {},
      });
    } else if (typeof p.text === "string" && !p.thought && p.text) {
      out.push({ type: "text", text: p.text });
    }
  }
  return {
    role: "assistant",
    parts: out,
    raw: { provider: PROVIDER, content: { role: "model", parts: merged } },
  };
}

/** HTTP 오류 → 사용자에게 보일 한국어 */
export function geminiError(status: number, message: string): AiError {
  if (status === 429)
    return new AiError(
      "Gemini 무료 사용량을 다 썼어요. 잠시 뒤에(분당 한도) 또는 내일 다시 해 주세요.",
      "rate_limited",
    );
  if (status === 400 && /api key|API_KEY/i.test(message))
    return new AiError(
      "Gemini API 키가 올바르지 않아요. 설정에서 키를 확인해 주세요.",
      "bad_key",
    );
  if (status === 401 || status === 403)
    return new AiError(
      "Gemini API 키로 이 모델을 쓸 수 없어요. 설정에서 키를 확인해 주세요.",
      "bad_key",
    );
  if (status >= 500)
    return new AiError(
      "Gemini가 지금 붐벼요. 잠시 뒤 다시 해 주세요.",
      "overloaded",
    );
  return new AiError(`Gemini 오류 (${status}): ${message}`, "bad_response");
}

/** SSE 본문을 읽어 `data:` 줄마다 JSON을 넘긴다 */
async function readSse(
  body: ReadableStream<Uint8Array>,
  onData: (json: unknown) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (data) onData(JSON.parse(data));
      }
    }
    if (done) break;
  }
  const rest = buf.trim();
  if (rest.startsWith("data:")) onData(JSON.parse(rest.slice(5).trim()));
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new AiError("취소했어요.", "aborted"));
    });
  });

export function createGeminiProvider(opts: {
  getKey: () => Promise<string | null>;
  model?: string;
  fetch?: typeof fetch;
}): AiProvider {
  const doFetch =
    opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const model = opts.model ?? GEMINI_MODEL;

  async function once(req: GenerateRequest, key: string): Promise<AiMessage> {
    const signal = req.signal
      ? AbortSignal.any([req.signal, AbortSignal.timeout(TIMEOUT_MS)])
      : AbortSignal.timeout(TIMEOUT_MS);
    let res: Response;
    try {
      res = await doFetch(`${BASE}/${model}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: toGeminiContents(req.messages),
          tools: req.tools.length
            ? [{ functionDeclarations: req.tools }]
            : undefined,
        }),
        signal,
      });
    } catch (e) {
      if (req.signal?.aborted) throw new AiError("취소했어요.", "aborted");
      throw new AiError(
        (e as Error)?.name === "TimeoutError"
          ? "Gemini 응답이 너무 늦어요. 다시 해 주세요."
          : "Gemini에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.",
        "network",
      );
    }
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw geminiError(
        res.status,
        body?.error?.message ?? `HTTP ${res.status}`,
      );
    }

    const parts: GeminiPart[] = [];
    let blocked: string | undefined;
    await readSse(res.body, (json) => {
      const j = json as {
        candidates?: {
          content?: { parts?: GeminiPart[] };
          finishReason?: string;
        }[];
        promptFeedback?: { blockReason?: string };
      };
      if (j.promptFeedback?.blockReason) blocked = j.promptFeedback.blockReason;
      const cand = j.candidates?.[0];
      for (const p of cand?.content?.parts ?? []) {
        parts.push(p);
        if (typeof p.text === "string" && !p.thought && p.text)
          req.onText?.(p.text);
      }
      if (
        cand?.finishReason &&
        !["STOP", "MAX_TOKENS"].includes(cand.finishReason)
      )
        blocked = cand.finishReason;
    });
    const msg = fromGeminiParts(parts);
    if (!msg.parts.length)
      throw new AiError(
        blocked
          ? `Gemini가 답하지 않았어요(${blocked}). 말을 바꿔 다시 해 주세요.`
          : "Gemini가 빈 답을 줬어요. 다시 해 주세요.",
        "bad_response",
      );
    return msg;
  }

  return {
    id: PROVIDER,
    async generate(req) {
      const key = await opts.getKey();
      if (!key)
        throw new AiError(
          "Gemini API 키가 없어요. 설정에서 넣어 주세요.",
          "no_key",
        );
      let streamed = false;
      const tracked: GenerateRequest = {
        ...req,
        onText: (d) => {
          streamed = true;
          req.onText?.(d);
        },
      };
      try {
        return await once(tracked, key);
      } catch (e) {
        // 붐빔(503)은 한 번만 다시. 이미 글자가 나갔으면 다시 하면 겹치니 그대로 실패
        if (e instanceof AiError && e.code === "overloaded" && !streamed) {
          await sleep(RETRY_DELAY_MS, req.signal);
          return once(tracked, key);
        }
        throw e;
      }
    },
  };
}
