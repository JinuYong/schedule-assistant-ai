// AI 공급자 중립 형식. 대화 기록은 이 형식으로 들고, 공급자마다 어댑터가 바꿔 보낸다
// (지금은 Gemini, 나중에 Anthropic·기본 AI·로컬 CLI).

export type AiPart =
  | { type: "text"; text: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      args: Record<string, unknown>;
    }
  | { type: "tool_result"; id: string; name: string; result: unknown };

export interface AiMessage {
  role: "user" | "assistant";
  parts: AiPart[];
  /**
   * 공급자가 준 원본. 같은 공급자에 다시 보낼 때 그대로 쓴다 — Gemini 3은 함수 호출 파트에
   * `thoughtSignature`를 붙여 주고, 다음 요청에 그대로 돌려줘야 도구 루프가 이어진다.
   */
  raw?: { provider: string; content: unknown };
}

/** 도구 인자 형식(JSON Schema 부분집합 — Gemini `parameters`가 받는 범위) */
export interface JsonSchema {
  type: "object" | "string" | "number" | "integer" | "boolean" | "array";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface GenerateRequest {
  system: string;
  messages: AiMessage[];
  tools: ToolSpec[];
  signal?: AbortSignal;
  /** 답 글자가 오는 대로 (스트리밍) */
  onText?: (delta: string) => void;
}

export interface AiProvider {
  id: string;
  generate(req: GenerateRequest): Promise<AiMessage>;
}

/** 사용자에게 그대로 보여 줄 수 있는 오류(한국어 메시지) */
export class AiError extends Error {
  constructor(
    message: string,
    readonly code:
      | "no_key"
      | "bad_key"
      | "rate_limited"
      | "overloaded"
      | "network"
      | "bad_response"
      | "aborted",
  ) {
    super(message);
    this.name = "AiError";
  }
}

export const toolCalls = (m: AiMessage) =>
  m.parts.filter(
    (p): p is Extract<AiPart, { type: "tool_call" }> => p.type === "tool_call",
  );

export const messageText = (m: AiMessage) =>
  m.parts
    .filter((p): p is Extract<AiPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
