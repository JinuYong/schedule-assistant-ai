import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauri-store";

const scheduled = new Map<string, ReturnType<typeof setTimeout>>();

/** 데스크탑 알림 즉시 전송 (Rust osascript 경유 — macOS 26에서 동작) */
export async function fireNotification(title: string, body: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("send_os_notification", { title, body });
}

/**
 * setTimeout이 받을 수 있는 최대 지연(2^31-1 ms ≈ 24.8일).
 *
 * 이보다 큰 값을 넘기면 32비트로 잘리면서 **즉시 발화**한다. 달력에서 다음 달로 넘어가면
 * 그리드 범위가 두 달 뒤까지 뻗어 이 한계를 넘는 일정이 섞여 들어오고, 그 알림이
 * 곧바로 울리던 문제가 있었다.
 */
const MAX_TIMEOUT_MS = 2_147_483_647;

export interface ScheduledNotification {
  id: string;
  title: string;
  body: string;
  time: number; // Unix ms
}

export async function scheduleNotification(event: ScheduledNotification) {
  cancelNotification(event.id);
  if (event.time - Date.now() <= 0) return;
  arm(event);
}

/**
 * 발송 시각까지 타이머를 건다.
 *
 * 남은 시간이 상한을 넘으면 상한만큼만 걸고, 깨어나서 남은 시간으로 다시 건다.
 * 매번 현재 시각으로 다시 계산하므로 절전에서 깨어나 시계가 튀어도 어긋나지 않는다.
 */
function arm(event: ScheduledNotification) {
  const remaining = event.time - Date.now();

  if (remaining > MAX_TIMEOUT_MS) {
    scheduled.set(event.id, setTimeout(() => arm(event), MAX_TIMEOUT_MS));
    return;
  }

  scheduled.set(event.id, setTimeout(() => {
    scheduled.delete(event.id);
    fireNotification(event.title, event.body).catch((e) => console.error("[notification]", e));
  }, Math.max(remaining, 0)));
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
