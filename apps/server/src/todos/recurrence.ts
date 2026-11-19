import type { TodoRepeat } from "@cali/shared";

// 반복 할일의 다음 회차 계산. 날짜·시각을 모두 UTC 달력으로 더한다(서버는 사용자 시간대를 모른다).
// 한국처럼 서머타임이 없는 곳에선 로컬 시각이 그대로 유지된다.

/** UTC 기준으로 반복 간격만큼 뒤. 월·연 단위에서 없는 날(1/31 → 2/31)은 그달 말일로 */
export function advance(at: Date, repeat: TodoRepeat): Date {
  const d = new Date(at);
  switch (repeat.type) {
    case "daily":
      d.setUTCDate(d.getUTCDate() + repeat.interval);
      return d;
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7 * repeat.interval);
      return d;
    case "monthly":
      return addMonths(d, repeat.interval);
    case "yearly":
      return addMonths(d, 12 * repeat.interval);
  }
}

function addMonths(d: Date, months: number): Date {
  const day = d.getUTCDate();
  const out = new Date(d);
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0),
  ).getUTCDate();
  out.setUTCDate(Math.min(day, lastDay));
  return out;
}

/** "YYYY-MM-DD" → 다음 회차 날짜 */
export function advanceDate(date: string, repeat: TodoRepeat): string {
  return advance(new Date(`${date}T00:00:00Z`), repeat)
    .toISOString()
    .slice(0, 10);
}
