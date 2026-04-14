import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { storeGet } from "./tauri-store";

export const DEFAULT_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT =
  "당신은 일정 관리 비서입니다. 사용자의 일정, 할일, 오늘 브리핑 요청에 친절하고 간결하게 답변합니다.";

export interface ParsedEvent {
  title: string;
  startTime: string;
  endTime: string;
  description?: string;
  location?: string;
  isAllDay: boolean;
  /** AI가 입력에서 추출한 목적 캘린더 이름 (없으면 기본 캘린더) */
  calendarName?: string;
}

async function getApiKey(): Promise<string> {
  const key = await storeGet<string>("anthropic.apiKey");
  if (!key) throw new Error("Anthropic API 키가 설정되지 않았습니다. 설정 페이지에서 입력해주세요.");
  return key;
}

/** 자연어 → 일정 파싱 (Rust command 경유, CORS 우회) */
export async function parseScheduleText(
  text: string,
  now: string,
  calendarNames?: string[]
): Promise<ParsedEvent | null> {
  const apiKey = await getApiKey();

  const calendarContext = calendarNames && calendarNames.length > 0
    ? `\n\n사용 가능한 캘린더 목록:\n${calendarNames.map((n) => `- ${n}`).join("\n")}\n입력에서 특정 캘린더가 언급되면 calendarName 필드에 목록 중 가장 가까운 캘린더명을 정확히 반환하세요. 언급이 없으면 calendarName을 비워두세요.`
    : "";

  const body = {
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    tools: [
      {
        name: "create_schedule_event",
        description: "자연어 입력에서 일정 정보를 추출합니다.",
        input_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            startTime: { type: "string", description: "ISO 8601" },
            endTime: { type: "string", description: "ISO 8601" },
            description: { type: "string" },
            location: { type: "string" },
            isAllDay: { type: "boolean" },
            calendarName: {
              type: "string",
              description: "추가할 캘린더 이름. 입력에서 언급된 경우에만 반환",
            },
          },
          required: ["title", "startTime", "endTime", "isAllDay"],
        },
      },
    ],
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: `현재 시각: ${now}${calendarContext}\n\n다음 문장에서 일정을 추출해주세요: "${text}"`,
      },
    ],
  };

  const result = await invoke<Record<string, unknown>>("call_claude", { apiKey, body });
  const content = result.content as Array<{ type: string; input?: unknown }> | undefined;
  const toolUse = content?.find((c) => c.type === "tool_use");
  if (!toolUse?.input) return null;
  return toolUse.input as ParsedEvent;
}

/** 스트리밍 채팅 — onChunk 콜백으로 텍스트 청크 수신 */
export async function streamChat(
  messages: Array<{ role: string; content: string }>,
  onChunk: (text: string) => void,
  onDone: () => void,
  systemOverride?: string
): Promise<() => void> {
  const apiKey = await getApiKey();
  const system = systemOverride ?? SYSTEM_PROMPT;

  const unlistenChunk = await listen<string>("chat-chunk", (e) => onChunk(e.payload));
  const unlistenDone = await listen("chat-done", () => {
    onDone();
    unlistenChunk();
    unlistenDone();
  });

  invoke("stream_chat", {
    apiKey,
    system,
    messages,
  }).catch((e) => {
    console.error("[stream_chat]", e);
    onDone();
    unlistenChunk();
    unlistenDone();
  });

  return () => {
    unlistenChunk();
    unlistenDone();
  };
}
