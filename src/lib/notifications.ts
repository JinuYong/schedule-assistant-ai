import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauri-store";

const scheduled = new Map<string, ReturnType<typeof setTimeout>>();

/** 데스크탑 알림 즉시 전송 (Rust osascript 경유 — macOS 26에서 동작) */
export async function fireNotification(title: string, body: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("send_os_notification", { title, body });
}

export async function scheduleNotification(event: {
  id: string;
  title: string;
  body: string;
  time: number; // Unix ms
}) {
  cancelNotification(event.id);
  const msUntil = event.time - Date.now();
  if (msUntil <= 0) return;

  const timeout = setTimeout(() => {
    fireNotification(event.title, event.body).catch((e) => console.error("[notification]", e));
    scheduled.delete(event.id);
  }, msUntil);

  scheduled.set(event.id, timeout);
}

export function cancelNotification(id: string) {
  const t = scheduled.get(id);
  if (t) {
    clearTimeout(t);
    scheduled.delete(id);
  }
}

/** 특정 접두사(예: "event-", "todo-")로 등록된 알림만 취소 — 다른 종류 알림은 보존 */
export function cancelNotificationsByPrefix(prefix: string) {
  for (const [id, t] of scheduled) {
    if (id.startsWith(prefix)) {
      clearTimeout(t);
      scheduled.delete(id);
    }
  }
}
