import { create } from "zustand";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatStore {
  messages: ChatMessage[];
  input: string;
  /** useState와 동일하게 값 또는 updater 모두 허용 */
  setMessages: (m: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setInput: (v: string) => void;
  clear: () => void;
}

/**
 * AI 브리핑(채팅) 상태. 모듈 레벨 싱글톤이라 탭 이동(페이지 언마운트)에도
 * 대화가 유지된다. (스트리밍 진행 상태는 리스너가 페이지에 묶여 있어 로컬에서 관리)
 */
export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  input: "",
  setMessages: (m) =>
    set((s) => ({ messages: typeof m === "function" ? m(s.messages) : m })),
  setInput: (v) => set({ input: v }),
  clear: () => set({ messages: [], input: "" }),
}));
