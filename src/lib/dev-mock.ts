// 개발용 더미데이터 모드.
// `NEXT_PUBLIC_MOCK=1 bun run dev` 로 실행하면 로그인 없이 브라우저에서
// 화면을 더미데이터로 볼 수 있다 (네트워크 호출은 건너뜀).
// 프로덕션/Tauri 빌드에는 영향 없음 (플래그가 꺼져 있으면 모든 값이 빈 값).

import type { BaseTokens } from "@/types/tokens";
import type { CalendarEvent } from "@/store/events";
import type { TodoItem } from "@/store/todos";
import type { CalendarListItem } from "@/lib/google-calendar";

export const MOCK_ENABLED = process.env.NEXT_PUBLIC_MOCK === "1";

const mockTokens = (): BaseTokens => ({
  access_token: "mock-access-token",
  refresh_token: "mock-refresh-token",
  expiresAt: Date.now() + 60 * 60 * 1000,
});

export const MOCK_GOOGLE_TOKENS: BaseTokens | null = MOCK_ENABLED ? mockTokens() : null;
export const MOCK_MICROSOFT_TOKENS: BaseTokens | null = MOCK_ENABLED ? mockTokens() : null;

/** dayOffset일 뒤 hour:min의 ISO 문자열 */
function at(dayOffset: number, hour: number, min = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

/** dayOffset일 뒤 날짜(YYYY-MM-DD) */
function dayKey(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split("T")[0];
}

export const MOCK_CALENDARS: CalendarListItem[] = [
  { id: "primary", summary: "내 캘린더", primary: true, backgroundColor: "#ec91d3" },
  { id: "work", summary: "회사", backgroundColor: "#5b9bd5" },
];

export const MOCK_EVENTS: CalendarEvent[] = MOCK_ENABLED
  ? [
      { id: "m1", title: "팀 스탠드업", startTime: at(0, 10), endTime: at(0, 10, 30), isAllDay: false, calendarColor: "#5b9bd5", calendarId: "work", location: "회의실 A" },
      { id: "m2", title: "점심 약속", startTime: at(0, 12, 30), endTime: at(0, 13, 30), isAllDay: false, calendarColor: "#ec91d3", calendarId: "primary" },
      { id: "m3", title: "코드 리뷰", startTime: at(0, 15), endTime: at(0, 16), isAllDay: false, calendarColor: "#5b9bd5", calendarId: "work" },
      { id: "m4", title: "치과 예약", startTime: at(1, 14), endTime: at(1, 15), isAllDay: false, calendarColor: "#ec91d3", calendarId: "primary", location: "강남" },
      { id: "m5", title: "프로젝트 마감", startTime: dayKey(3), endTime: dayKey(3), isAllDay: true, calendarColor: "#5b9bd5", calendarId: "work" },
      { id: "m6", title: "주간 회고", startTime: at(5, 17), endTime: at(5, 18), isAllDay: false, calendarColor: "#5b9bd5", calendarId: "work" },
      // 멀티데이 일정 (연속 막대 확인용) — 종일 end.date는 배타적이라 하루 더 줌
      { id: "m7", title: "워크샵 출장", startTime: dayKey(-1), endTime: dayKey(4), isAllDay: true, calendarColor: "#5b9bd5", calendarId: "work" },
      { id: "m8", title: "전사 행사", startTime: dayKey(1), endTime: dayKey(3), isAllDay: true, calendarColor: "#ec91d3", calendarId: "primary" },
      // 긴 제목 (셀 폭 넘침 회귀 확인용) — min-width:0 없으면 이 칸이 열을 늘려 캘린더가 넘침
      { id: "m9", title: "분기 마감 전 최종 점검 및 팀 회식 장소 예약하기", startTime: at(2, 18), endTime: at(2, 19), isAllDay: false, calendarColor: "#ec91d3", calendarId: "primary" },
    ]
  : [];

export const MOCK_TASKLISTS: { id: string; displayName: string }[] = MOCK_ENABLED
  ? [
      { id: "tasks", displayName: "작업" },
      { id: "personal", displayName: "개인" },
      { id: "shopping", displayName: "쇼핑" }, // 미완료 할일 없는 목록(빈 카테고리 확인용)
    ]
  : [];

export const MOCK_TODOS: TodoItem[] = MOCK_ENABLED
  ? [
      { id: "t1", listId: "tasks", listName: "작업", title: "분기 보고서 작성 및 팀 리뷰 미팅 자료 정리하기", importance: "high", status: "notStarted", dueDateTime: { dateTime: `${dayKey(0)}T00:00:00.0000000`, timeZone: "UTC" } },
      { id: "t2", listId: "tasks", listName: "작업", title: "이메일 회신", importance: "normal", status: "notStarted" },
      {
        id: "t3", listId: "tasks", listName: "작업", title: "주간 미팅 준비", importance: "normal", status: "notStarted",
        recurrence: { pattern: { type: "weekly", interval: 1 }, range: { type: "noEnd" } },
        checklistItems: [
          { id: "c1", displayName: "자료 정리", isChecked: true },
          { id: "c2", displayName: "발표 연습", isChecked: false },
        ],
      },
      { id: "t4", listId: "personal", listName: "개인", title: "운동 가기", importance: "normal", status: "notStarted", dueDateTime: { dateTime: `${dayKey(1)}T00:00:00.0000000`, timeZone: "UTC" } },
    ]
  : [];
