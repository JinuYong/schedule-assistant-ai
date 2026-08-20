/**
 * 이벤트 표시 색 결정.
 *
 * 기본은 Google Calendar에 설정된 캘린더 색을 그대로 쓰되, 공휴일 캘린더의 항목만
 * 종류에 따라 덮어쓴다. Google 공휴일 캘린더는 쉬는 날과 그렇지 않은 날을 한 캘린더에
 * 섞어 보내면서 `description`으로만 구분하기 때문에, 색이 같으면 달력에서 분간이 안 된다.
 *
 * 색을 쓰는 곳이 여러 군데(월간 그리드·일정 목록·상세 모달)라 여기 한곳에 모은다.
 */

/** 쉬는 날 — 눈에 확 띄어야 한다 */
export const HOLIDAY_COLOR = "#c44343";

/**
 * 쉬는 날은 아니지만 알아둬야 하는 날(어버이날 등).
 *
 * 공휴일과 헷갈리지 않게 붉은 계열을 피하고, 채도를 낮춰 일반 일정보다 한 발 물러나게 한다.
 * 더 흐리게 하면 막대 위 흰 글자(11px)의 대비가 부족해진다.
 */
export const OBSERVANCE_COLOR = "#8a93a0";

/** 색을 정할 때 필요한 최소 정보 (store의 CalendarEvent와 순환 참조하지 않도록 구조적 타입) */
interface ColorSource {
  description?: string;
  calendarColor?: string;
  calendarId?: string;
}

export function eventColor(ev: ColorSource): string | undefined {
  if (!isHolidayCalendar(ev.calendarId)) return ev.calendarColor;
  // 공휴일 캘린더 안에서만 종류를 가른다. 쉬는 날이라는 근거가 없으면 전부 기념일 취급 —
  // 24절기·잡절처럼 종류가 늘어도 "쉬는 날 아님"으로 맞게 떨어진다.
  return ev.description?.startsWith("공휴일") ? HOLIDAY_COLOR : OBSERVANCE_COLOR;
}

/**
 * Google이 제공하는 공휴일 캘린더인지.
 *
 * id가 `ko.south_korea#holiday@group.v.calendar.google.com` 꼴이라 `#holiday@`로 판별한다.
 * 나라가 달라도 같은 형식이므로 그대로 걸린다.
 *
 * description만 보고 판단하면 사용자가 직접 만든 일정 설명에 "공휴일"이라고 적었을 때도
 * 색이 바뀐다. 캘린더로 먼저 거르는 이유다.
 */
function isHolidayCalendar(calendarId?: string): boolean {
  return !!calendarId?.includes("#holiday@");
}
