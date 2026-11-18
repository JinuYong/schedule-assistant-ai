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
    ? `\n\n사용 가능한 캘린더 목록:\n${calendarNames.map((n) => `- ${n}`).join("\n")}\n` +
      `calendarName은 사용자가 일정을 특정 캘린더에 넣으라고 **명시적으로 지시**한 경우에만 반환하세요. ` +
      `보통 "○○ 캘린더에", "○○에 추가해줘"처럼 캘린더를 가리키는 표현이 있어야 합니다. ` +
      `**일정 제목·내용에 들어간 단어(사람 이름 등)가 캘린더 이름과 우연히 일치하는 것은 캘린더 지정이 아닙니다** — ` +
      `그 단어는 제목의 일부로 두고 calendarName은 비워두세요. 애매하면 비워두세요.`
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
              description: "사용자가 일정을 넣을 캘린더를 명시적으로 지시한 경우에만 반환(예: '회사 캘린더에'). 제목에 우연히 캘린더명과 같은 단어가 있어도 지정이 아니면 비워둘 것.",
            },
          },
          required: ["title", "startTime", "endTime", "isAllDay"],
        },
      },
    ],
    // 반드시 도구를 호출하도록 강제 (auto면 모델이 텍스트로 답해 파싱 실패할 수 있음)
    tool_choice: { type: "tool", name: "create_schedule_event" },
    messages: [
      {
        role: "user",
        content: `현재 시각: ${now}${calendarContext}\n\n다음 문장에서 일정을 추출해주세요: "${text}"`,
      },
    ],
  };

  const result = await invoke<Record<string, unknown>>("call_claude", { apiKey, body });
  throwIfClaudeError(result);
  const content = result.content as Array<{ type: string; input?: unknown }> | undefined;
  const toolUse = content?.find((c) => c.type === "tool_use");
  if (!toolUse?.input) return null;
  return toolUse.input as ParsedEvent;
}

/** call_claude 응답이 Claude API 에러 형태면 메시지를 던져 표면화 (Rust가 상태코드를 놓쳐도 안전) */
function throwIfClaudeError(result: Record<string, unknown>): void {
  if (result?.type === "error" || result?.error) {
    const m = (result.error as { message?: string } | undefined)?.message;
    throw new Error(m ? `Claude API: ${m}` : "Claude API 오류가 발생했습니다.");
  }
}

/** 자동완성에서 선택한 기존 일정에 대한 명령(삭제/수정) */
export type EditCommand =
  | { action: "delete" }
  | { action: "update"; changes: ParsedEventChanges };

export interface ParsedEventChanges {
  title?: string;
  startTime?: string; // ISO 8601
  endTime?: string; // ISO 8601
  location?: string;
  isAllDay?: boolean;
}

interface TargetEventContext {
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  isAllDay: boolean;
}

/**
 * 자연어 → 선택된 기존 일정에 대한 삭제/수정 명령 파싱.
 * 사용자가 자동완성에서 대상 일정을 고른 뒤 호출한다.
 */
export async function parseEditCommand(
  text: string,
  now: string,
  target: TargetEventContext
): Promise<EditCommand | null> {
  const apiKey = await getApiKey();

  const targetContext =
    `대상 일정 정보:\n` +
    `- 제목: ${target.title}\n` +
    `- 시작: ${target.startTime}\n` +
    `- 종료: ${target.endTime}\n` +
    `- 종일: ${target.isAllDay}\n` +
    (target.location ? `- 장소: ${target.location}\n` : "");

  const body = {
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    tools: [
      {
        name: "delete_schedule_event",
        description: "사용자가 대상 일정을 삭제(취소/제거)하려 할 때 호출합니다.",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "update_schedule_event",
        description:
          "사용자가 대상 일정을 수정(시간 변경/제목 변경/장소 변경 등)하려 할 때 호출합니다. 변경되는 필드만 채우세요. 시간을 바꾸면 startTime과 endTime을 모두 ISO 8601로 반환하되, 변경 없는 쪽은 대상 일정의 기존 값을 그대로 유지하세요.",
        input_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            startTime: { type: "string", description: "ISO 8601" },
            endTime: { type: "string", description: "ISO 8601" },
            location: { type: "string" },
            isAllDay: { type: "boolean" },
          },
        },
      },
    ],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content: `현재 시각: ${now}\n${targetContext}\n다음 요청을 처리해주세요: "${text}"`,
      },
    ],
  };

  const result = await invoke<Record<string, unknown>>("call_claude", { apiKey, body });
  throwIfClaudeError(result);
  const content = result.content as Array<{ type: string; name?: string; input?: unknown }> | undefined;
  const toolUse = content?.find((c) => c.type === "tool_use");
  if (!toolUse) return null;
  if (toolUse.name === "delete_schedule_event") return { action: "delete" };
  if (toolUse.name === "update_schedule_event") {
    return { action: "update", changes: (toolUse.input ?? {}) as ParsedEventChanges };
  }
  return null;
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
