// AI 도구가 주고받는 일정 시간 형식과 Google Calendar 형식 사이의 변환. 모두 한국 시간(KST) 기준.
//
// 도구 형식: 시간 일정은 ISO 8601(오프셋 없으면 KST로 본다), 종일 일정은 YYYY-MM-DD이고
// **끝은 마지막 날을 포함**한다(12/3~12/5 여행 → end "2026-12-05").
// Google은 종일 끝을 다음 날(배타)로 받는다. 모델마다 종일 끝을 "다음 날 00:00"(배타)나
// "같은 날 23:59:59"(포함)로 주기도 해서(2026-11-18 실측) 여기서 하나로 맞춘다.

const KST_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const hasOffset = (s: string) => /(Z|[+-]\d{2}:?\d{2})$/i.test(s);
const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** 도구 형식 시각 → epoch ms (오프셋 없으면 KST) */
export function parseKst(s: string): number {
  const v = s.trim();
  const ms = isDateOnly(v)
    ? Date.parse(`${v}T00:00:00+09:00`)
    : Date.parse(hasOffset(v) ? v : `${v}+09:00`);
  if (Number.isNaN(ms)) throw new Error(`시간 형식을 알 수 없다: ${s}`);
  return ms;
}

/** epoch ms → "2026-11-27T15:00:00+09:00" */
export const kstIso = (ms: number) =>
  `${new Date(ms + KST_MS).toISOString().slice(0, 19)}+09:00`;

/** epoch ms → KST 날짜 "2026-11-27" */
export const kstDate = (ms: number) =>
  new Date(ms + KST_MS).toISOString().slice(0, 10);

export const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);

export interface ToolTimes {
  start: string;
  end?: string;
  allDay?: boolean;
}

export interface GoogleTimes {
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
}

/** 도구 형식 → Google 본문의 start·end. 끝이 없거나 시작보다 앞이면 시간 일정은 1시간, 종일은 하루 */
export function toGoogleTimes(t: ToolTimes): GoogleTimes {
  const allDay = t.allDay ?? isDateOnly(t.start.trim());
  const startMs = parseKst(t.start);

  if (allDay) {
    const s = kstDate(startMs);
    let lastDay = s; // 포함하는 마지막 날
    if (t.end) {
      const e = t.end.trim();
      const endMs = parseKst(e);
      const d = kstDate(endMs);
      // 날짜만 → 포함. 시각이 자정 정각이고 시작보다 뒤 → 배타 끝(다음 날 00:00)으로 보고 하루 뺀다
      const midnight = !isDateOnly(e) && (endMs + KST_MS) % DAY_MS === 0;
      lastDay = midnight && d > s ? addDays(d, -1) : d;
    }
    if (lastDay < s) lastDay = s;
    return { start: { date: s }, end: { date: addDays(lastDay, 1) } };
  }

  let endMs = t.end ? parseKst(t.end) : startMs + HOUR_MS;
  if (endMs <= startMs) endMs = startMs + HOUR_MS;
  return {
    start: { dateTime: kstIso(startMs), timeZone: "Asia/Seoul" },
    end: { dateTime: kstIso(endMs), timeZone: "Asia/Seoul" },
  };
}

/** Google 일정 시간 → 도구 형식(종일 끝은 포함하는 마지막 날로) */
export function fromGoogleTimes(ev: {
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}): { start: string; end: string; allDay: boolean } {
  if (ev.start?.date) {
    const s = ev.start.date;
    const endExclusive = ev.end?.date ?? addDays(s, 1);
    const last = addDays(endExclusive, -1);
    return { start: s, end: last < s ? s : last, allDay: true };
  }
  const s = ev.start?.dateTime ?? "";
  const e = ev.end?.dateTime ?? s;
  return {
    start: kstIso(parseKst(s)),
    end: kstIso(parseKst(e)),
    allDay: false,
  };
}

/** 사람이 읽을 때: "11/30(월) 10:00", 종일은 "12/3(목)~12/5(토)" */
export function whenLabel(t: {
  start: string;
  end?: string;
  allDay: boolean;
}): string {
  const day = (ms: number) => {
    const d = new Date(ms + KST_MS);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]})`;
  };
  const startMs = parseKst(t.start);
  if (t.allDay) {
    const endMs = t.end ? parseKst(t.end) : startMs;
    return kstDate(endMs) > kstDate(startMs)
      ? `${day(startMs)}~${day(endMs)}`
      : `${day(startMs)} 종일`;
  }
  const hm = (ms: number) => new Date(ms + KST_MS).toISOString().slice(11, 16);
  const base = `${day(startMs)} ${hm(startMs)}`;
  if (!t.end) return base;
  const endMs = parseKst(t.end);
  return kstDate(endMs) === kstDate(startMs)
    ? `${base}~${hm(endMs)}`
    : `${base}~${day(endMs)} ${hm(endMs)}`;
}

/** 시스템 프롬프트용 "2026-11-26(목) 11:00" */
export function nowLabel(now = Date.now()): string {
  const d = new Date(now + KST_MS);
  return `${kstDate(now)}(${WEEKDAYS[d.getUTCDay()]}) ${d.toISOString().slice(11, 16)}`;
}
