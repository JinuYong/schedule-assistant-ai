// 캘린더 쓰기 권한 판별. 목록(getCalendarList)은 보기 위해 읽기 전용(공휴일·남이 공유한 캘린더)까지
// 받지만, 일정을 만들거나 고치는 곳에서는 쓸 수 있는 캘린더만 다뤄야 한다(아니면 저장 때 403).

interface CalendarAccess {
  id: string;
  accessRole?: string;
}

/** 일정을 만들고 고칠 수 있는 캘린더인가. accessRole이 없으면(더미 데이터) 쓸 수 있다고 본다 */
export const canWriteCalendar = (cal: Pick<CalendarAccess, "accessRole">) =>
  !cal.accessRole || cal.accessRole === "owner" || cal.accessRole === "writer";

export const writableCalendars = <T extends CalendarAccess>(calendars: T[]) =>
  calendars.filter(canWriteCalendar);

/**
 * 이 일정을 고치거나 지울 수 있는가.
 * 캘린더가 목록에 없으면(아직 못 불러왔거나 calendarId가 없는 primary) 막지 않는다 — 막아서 생기는 불편이 더 크다.
 */
export function canEditEvent(
  event: { calendarId?: string },
  calendars: CalendarAccess[],
) {
  const cal = calendars.find((c) => c.id === event.calendarId);
  return !cal || canWriteCalendar(cal);
}
