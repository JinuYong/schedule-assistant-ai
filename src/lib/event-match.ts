// 이벤트 자동완성·매칭 도메인 — 자연어 입력창(일정탭·플로팅)과 공유 훅이 사용.
// 날짜 표현 파싱, 제목/날짜 기반 후보 매칭, 캘린더 이름 매칭.

import { CalendarEvent } from "@/store/events";
import { CalendarListItem } from "@/lib/google-calendar";
import { isoDate } from "@/lib/date-utils";

export function getEventDateKey(ev: CalendarEvent): string {
  return ev.startTime.split("T")[0] ?? ev.startTime.slice(0, 10);
}

/** 자동완성 후보의 날짜·시간 짧은 라벨 (예: 6/17 종일, 6/17 15:00) */
export function eventShortLabel(ev: CalendarEvent): string {
  const d = new Date(ev.startTime);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  if (ev.isAllDay) return `${md} 종일`;
  const t = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${md} ${t}`;
}

/**
 * 입력에서 날짜 표현을 추출해 YYYY-MM-DD로 반환(AI 호출 없음). 없으면 null.
 * 지원: 오늘/내일/모레/어제, "M월 D일", "M/D", "N일"(지난 날짜는 다음 달로).
 */
export function parseDateHint(query: string, now = new Date()): string | null {
  const q = query.trim();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rel = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
  };

  if (/오늘/.test(q)) return rel(0);
  if (/(내일|낼)/.test(q)) return rel(1);
  if (/모레/.test(q)) return rel(2);
  if (/어제/.test(q)) return rel(-1);

  // "M월 D일" 또는 "M/D"·"M-D"·"M.D" — 지난 날짜면 내년 (다가오는 날짜 우선)
  let m = q.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (!m) m = q.match(/(?:^|\s)(\d{1,2})[/\-.](\d{1,2})(?:$|\s)/);
  if (m) {
    const mo = Number(m[1]);
    const da = Number(m[2]);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      let y = now.getFullYear();
      if (new Date(y, mo - 1, da) < today) y += 1;
      const d = new Date(y, mo - 1, da);
      return d.getMonth() === mo - 1 ? isoDate(y, mo - 1, da) : null; // 무효 날짜 제외
    }
  }

  // "N일" — 이번 달 기준, 지난 날짜면 다음 달 (다가오는 날짜 우선)
  m = q.match(/(\d{1,2})\s*일/);
  if (m) {
    const da = Number(m[1]);
    if (da >= 1 && da <= 31) {
      let y = now.getFullYear();
      let mo = now.getMonth(); // 0-based
      if (da < now.getDate()) {
        mo += 1;
        if (mo > 11) { mo = 0; y += 1; }
      }
      // 해당 월에 그 날짜가 없으면(예: 6월 31일) 다음 달로
      if (new Date(y, mo, da).getDate() !== da) {
        mo += 1;
        if (mo > 11) { mo = 0; y += 1; }
        if (new Date(y, mo, da).getDate() !== da) return null;
      }
      return isoDate(y, mo, da);
    }
  }

  return null;
}

/**
 * 입력 텍스트로 기존 일정을 자동완성 후보로 매칭(AI 호출 없음).
 * - 날짜 표현("내일", "18일" 등) → 그날 일정 전체를 시간순으로 (이름 매칭 시 상위)
 * - 그 외 → 제목 토큰 매칭, 임박한 일정 우선
 */
export function matchEventsByText(
  query: string,
  events: CalendarEvent[],
  limit = 6,
  now = new Date()
): CalendarEvent[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);

  const titleScore = (title: string) => {
    let score = 0;
    for (const t of tokens) if (title.includes(t)) score += t.length;
    if (title.length >= 2 && q.includes(title)) score += title.length * 2;
    return score;
  };
  const byTime = (a: CalendarEvent, b: CalendarEvent) =>
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime();

  // 날짜 표현이 있으면 그날 일정 목록을 우선 제공
  const dateHint = parseDateHint(q, now);
  if (dateHint) {
    return events
      .filter((ev) => getEventDateKey(ev) === dateHint)
      .sort((a, b) => titleScore(b.title.toLowerCase()) - titleScore(a.title.toLowerCase()) || byTime(a, b))
      .slice(0, limit);
  }

  if (tokens.length === 0) return [];
  return events
    .map((ev) => ({ ev, score: titleScore(ev.title.toLowerCase()) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || byTime(a.ev, b.ev))
    .slice(0, limit)
    .map((x) => x.ev);
}

/** 이모지 제거 후 공백 정리 */
function stripEmoji(s: string): string {
  return s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}⭐★☆♥♦♣♠]/gu, "").trim();
}

/** AI가 반환한 calendarName을 실제 캘린더 목록에서 매칭 */
export function matchCalendar(name: string, calendars: CalendarListItem[]): CalendarListItem | undefined {
  if (!name) return undefined;
  // 1) 완전 일치
  const exact = calendars.find((c) => c.summary === name);
  if (exact) return exact;
  // 2) 이모지 제거 후 일치
  const stripped = stripEmoji(name);
  return calendars.find((c) => stripEmoji(c.summary) === stripped || c.summary.includes(stripped));
}
