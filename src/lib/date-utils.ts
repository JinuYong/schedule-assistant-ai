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