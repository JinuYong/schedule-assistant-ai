// 반복 할일의 날짜 계산. 앱(마감일 맞추기·"다음:" 안내)과 서버(완료 시 다음 회차)가 같이 쓴다.
// 날짜는 "YYYY-MM-DD"(시간대 없음)를 UTC 자정으로 다뤄 달력 계산만 한다.

import type { TodoRepeat } from "./todos";

const DAY_MS = 86_400_000;

const toDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
};
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
const lastDay = (y: number, m0: number) =>
  new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** "YYYY-MM-DD"의 요일(0=일 … 6=토) */
export const weekdayOf = (date: string) => toDate(date).getUTCDay();

/** 그달의 N번째 요일(week -1은 마지막) */
function nthWeekday(y: number, m0: number, week: number, weekday: number) {
  if (week === -1) {
    const last = new Date(Date.UTC(y, m0, lastDay(y, m0)));
    return addDays(last, -((last.getUTCDay() - weekday + 7) % 7));
  }
  const first = new Date(Date.UTC(y, m0, 1));
  return addDays(
    first,
    ((weekday - first.getUTCDay() + 7) % 7) + (week - 1) * 7,
  );
}

/** 매월 반복에서 그달의 해당 날. 없는 날(31일)은 말일로 */
function monthlyDate(
  y: number,
  m0: number,
  on: Extract<TodoRepeat, { type: "monthly" }>["on"],
) {
  // Date.UTC가 넘친 달을 다음 해로 넘겨 준다
  const base = new Date(Date.UTC(y, m0, 1));
  const [yy, mm] = [base.getUTCFullYear(), base.getUTCMonth()];
  if (on.kind === "lastDay") return new Date(Date.UTC(yy, mm, lastDay(yy, mm)));
  if (on.kind === "weekday") return nthWeekday(yy, mm, on.week, on.weekday);
  return new Date(Date.UTC(yy, mm, Math.min(on.day, lastDay(yy, mm))));
}

function yearlyDate(y: number, month: number, day: number) {
  return new Date(Date.UTC(y, month - 1, Math.min(day, lastDay(y, month - 1))));
}

function dailyMatches(d: Date, days: "all" | "weekdays" | "weekends") {
  const w = d.getUTCDay();
  if (days === "weekdays") return w >= 1 && w <= 5;
  if (days === "weekends") return w === 0 || w === 6;
  return true;
}

/**
 * date와 같거나 뒤인 첫 회차. 반복을 새로 고르거나 마감일이 패턴에 안 맞을 때 마감일을 여기로 옮긴다.
 * 간격(N주·N개월마다)은 첫 회차부터 센다 — 첫 회차 자체는 가장 가까운 맞는 날.
 */
export function firstOccurrence(date: string, repeat: TodoRepeat): string {
  const d = toDate(date);
  switch (repeat.type) {
    case "daily": {
      for (let i = 0; i < 7; i++)
        if (dailyMatches(addDays(d, i), repeat.days))
          return toIso(addDays(d, i));
      return date;
    }
    case "weekly": {
      for (let i = 0; i < 7; i++)
        if (repeat.weekdays.includes(addDays(d, i).getUTCDay()))
          return toIso(addDays(d, i));
      return date;
    }
    case "monthly": {
      for (let k = 0; k < 2; k++) {
        const c = monthlyDate(
          d.getUTCFullYear(),
          d.getUTCMonth() + k,
          repeat.on,
        );
        if (c >= d) return toIso(c);
      }
      return date;
    }
    case "yearly": {
      for (let k = 0; k < 2; k++) {
        const c = yearlyDate(d.getUTCFullYear() + k, repeat.month, repeat.day);
        if (c >= d) return toIso(c);
      }
      return date;
    }
  }
}

/** date 다음 회차(date보다 뒤). 완료하면 서버가 이 날로 새 할일을 만든다 */
export function nextOccurrence(date: string, repeat: TodoRepeat): string {
  const d = toDate(date);
  switch (repeat.type) {
    case "daily":
      for (let i = 1; i <= 7; i++)
        if (dailyMatches(addDays(d, i), repeat.days))
          return toIso(addDays(d, i));
      return toIso(addDays(d, 1));
    case "weekly": {
      // 주는 일요일부터. date가 든 주를 0주차로 세어 interval의 배수인 주만 쓴다
      const weekStart = addDays(d, -d.getUTCDay());
      for (let i = 1; i <= 7 * repeat.interval + 7; i++) {
        const c = addDays(d, i);
        const weeks = Math.round(
          (addDays(c, -c.getUTCDay()).getTime() - weekStart.getTime()) /
            (7 * DAY_MS),
        );
        if (
          weeks % repeat.interval === 0 &&
          repeat.weekdays.includes(c.getUTCDay())
        )
          return toIso(c);
      }
      return toIso(addDays(d, 7 * repeat.interval));
    }
    case "monthly":
      for (let k = 0; k <= repeat.interval * 2; k += repeat.interval) {
        const c = monthlyDate(
          d.getUTCFullYear(),
          d.getUTCMonth() + k,
          repeat.on,
        );
        if (c > d) return toIso(c);
      }
      return date;
    case "yearly":
      for (let k = 0; k <= 2; k++) {
        const c = yearlyDate(d.getUTCFullYear() + k, repeat.month, repeat.day);
        if (c > d) return toIso(c);
      }
      return date;
  }
}

/** 두 날짜 사이 일수(b - a) — 다음 회차로 알림 시각을 같은 만큼 미룰 때 */
export const daysBetween = (a: string, b: string) =>
  Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY_MS);
