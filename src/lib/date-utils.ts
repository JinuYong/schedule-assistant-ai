/** Microsoft Graph dueDateTime을 로컬 날짜로 변환
 *  - timeZone 필드를 사용해 정확히 파싱 (Temporal 우선, fallback으로 "Z" 붙이기)
 *  - "Korea Standard Time" 같은 Windows 형식도 Temporal이 처리
 */
export function formatDue(dateTime: string, timeZone = "UTC") {
  let d: Date;
  try {
    const tz = (window as any).Temporal
      ? (window as any).Temporal.ZonedDateTime.from(`${dateTime}[${timeZone}]`).toInstant().epochMilliseconds
      : null;
    d = tz !== null
      ? new Date(tz)
      : new Date(dateTime.endsWith("Z") || dateTime.includes("+") ? dateTime : dateTime + "Z");
  } catch {
    d = new Date(dateTime.endsWith("Z") || dateTime.includes("+") ? dateTime : dateTime + "Z");
  }
  const today = new Date();
  const isPast = d < today && d.toDateString() !== today.toDateString();
  const isToday = d.toDateString() === today.toDateString();
  const label = isToday
    ? "오늘"
    : d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  return { label, isPast };
}

/** "2026년 6월" 형식의 월/연 라벨 */
export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("ko-KR", { year: "numeric", month: "long" });
}

/** ISO 시각 → "오후 3시" / "오후 3:30" (정시는 분 생략) */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("ko-KR", date.getMinutes() === 0 ? { hour: "numeric" } : { hour: "numeric", minute: "2-digit" });
}

/** "YYYY-MM-DD" → "6월 12일 (금)" 형식의 날짜 라벨 */
export function formatDateLabel(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("ko-KR", {
    month: "long", day: "numeric", weekday: "short",
  });
}