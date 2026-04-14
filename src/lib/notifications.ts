import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { isTauri } from "./tauri-store";

const scheduled = new Map<string, ReturnType<typeof setTimeout>>();

export async function scheduleNotification(event: {
  id: string;
  title: string;
  body: string;
  time: number; // Unix ms
}) {
  cancelNotification(event.id);
  const msUntil = event.time - Date.now();
  if (msUntil <= 0) return;

  const timeout = setTimeout(async () => {
    if (!isTauri()) return;
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === "granted";
    }
    if (granted) {
      await sendNotification({ title: event.title, body: event.body });
    }
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

export function cancelAllNotifications() {
  scheduled.forEach((t) => clearTimeout(t));
  scheduled.clear();
}
