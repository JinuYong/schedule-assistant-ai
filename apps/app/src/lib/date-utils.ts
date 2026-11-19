/** 마감일("YYYY-MM-DD", 시각 없음) → 표시 라벨. 오늘이면 "오늘", 어제 이전이면 isPast */
export function formatDue(date: string) {
  const now = new Date();
  const today = isoDate(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = date.split("-").map(Number);
  const label =
    date === today
      ? "오늘"
      : new Date(y!, m! - 1, d!).toLocaleDateString("ko-KR", {
          month: "short",
          day: "numeric",
        });
  return { label, isPast: date < today };
}

/** 오늘(로컬) "YYYY-MM-DD" */
export function todayIsoDate(): string {
  const now = new Date();
  return isoDate(now.getFullYear(), now.getMonth(), now.getDate());
}

/** (year, month0-based, day) → "YYYY-MM-DD" */
export function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "2026년 6월" 형식의 월/연 라벨 */
export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
  });
}

/** ISO 시각 → "오후 3시" / "오후 3:30" (정시는 분 생략) */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(
    "ko-KR",
    date.getMinutes() === 0
      ? { hour: "numeric" }
      : { hour: "numeric", minute: "2-digit" },
  );
}

/** "YYYY-MM-DD" → "6월 12일 (금)" 형식의 날짜 라벨 */
export function formatDateLabel(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

/** Unix ms → "6월 28일 오전 9시" (정시는 분 생략) — 알림 시각 표시용 */
export function formatDateTimeLabel(ms: number): string {
  const d = new Date(ms);
  const datePart = d.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  });
  const timePart = d.toLocaleTimeString(
    "ko-KR",
    d.getMinutes() === 0
      ? { hour: "numeric" }
      : { hour: "numeric", minute: "2-digit" },
  );
  return `${datePart} ${timePart}`;
}
