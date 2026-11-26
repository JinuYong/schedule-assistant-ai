// 플로팅 창 ↔ 메인 창 다리. AI 세션(store/ai.ts)은 메인 창에만 있고, 플로팅은 Tauri 이벤트로 부탁한다.
//   플로팅 → 메인: ai:request {entryId, text, target}, ai:confirm-answer {id, ok}
//   메인 → 플로팅: ai:entry (플로팅 출처 항목이 바뀔 때마다), ai:confirm (플로팅 출처 확인 또는 null)

import { emit, listen } from "@tauri-apps/api/event";
import { isTauri } from "@/lib/tauri-store";
import {
  useAiStore,
  type AiConfirm,
  type AiEntry,
  type AiTarget,
} from "@/store/ai";

interface RequestPayload {
  entryId: string;
  text: string;
  target?: AiTarget;
}

/** 메인 창: 플로팅의 부탁을 받아 세션에 넣고, 진행을 돌려보낸다 */
export function startMainBridge(): () => void {
  if (!isTauri()) return () => {};
  const offs: Promise<() => void>[] = [
    listen<RequestPayload>("ai:request", (e) => {
      useAiStore.getState().ask({ ...e.payload, origin: "floating" });
    }),
    listen<{ id: string; ok: boolean }>("ai:confirm-answer", (e) => {
      useAiStore.getState().answerConfirm(e.payload.id, e.payload.ok);
    }),
  ];
  const unsub = useAiStore.subscribe((s, prev) => {
    for (const entry of s.entries) {
      if (entry.origin !== "floating") continue;
      if (prev.entries.find((p) => p.id === entry.id) === entry) continue;
      void emit("ai:entry", entry);
    }
    if (s.confirm !== prev.confirm)
      void emit(
        "ai:confirm",
        s.confirm?.origin === "floating" ? s.confirm : null,
      );
  });
  return () => {
    unsub();
    for (const off of offs) void off.then((f) => f());
  };
}

/** 메인 창이 받았다는 신호(queued)가 이 안에 안 오면 실패로 본다 */
const ACK_TIMEOUT_MS = 4000;

/** 플로팅 창: 메인 창에 부탁하고 끝날 때까지 기다린다 */
export async function askMain(
  text: string,
  target?: AiTarget,
): Promise<AiEntry> {
  const entryId = crypto.randomUUID();
  const fail = (error: string): AiEntry => ({
    id: entryId,
    origin: "floating",
    text,
    status: "error",
    reply: "",
    actions: [],
    error,
  });
  return new Promise((resolve) => {
    let acked = false;
    let off: (() => void) | undefined;
    const finish = (e: AiEntry) => {
      clearTimeout(timer);
      off?.();
      resolve(e);
    };
    const timer = setTimeout(() => {
      if (!acked)
        finish(fail("메인 창이 응답하지 않아요. Cali를 다시 열어 주세요."));
    }, ACK_TIMEOUT_MS);
    void listen<AiEntry>("ai:entry", (ev) => {
      if (ev.payload.id !== entryId) return;
      acked = true;
      if (ev.payload.status === "done" || ev.payload.status === "error")
        finish(ev.payload);
    }).then((f) => {
      off = f;
      void emit("ai:request", {
        entryId,
        text,
        target,
      } satisfies RequestPayload);
    });
  });
}

/** 플로팅 창: 메인이 보낸 확인 요청을 듣는다 */
export function listenFloatingConfirm(
  onConfirm: (c: AiConfirm | null) => void,
): () => void {
  const off = listen<AiConfirm | null>("ai:confirm", (e) =>
    onConfirm(e.payload),
  );
  return () => void off.then((f) => f());
}

export function answerMainConfirm(id: string, ok: boolean) {
  void emit("ai:confirm-answer", { id, ok });
}
