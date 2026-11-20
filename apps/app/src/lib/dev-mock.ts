// 개발용 더미데이터 모드.
// `bun run dev`(VITE_MOCK=1) 로 실행하면 로그인 없이 브라우저에서
// 화면을 더미데이터로 볼 수 있다 (네트워크 호출은 건너뜀).
// 프로덕션/Tauri 빌드에는 영향 없음 (플래그가 꺼져 있으면 모든 값이 빈 값).

import {
  weekdayOf,
  type PublicUser,
  type Todo,
  type TodoList,
} from "@cali/shared";
import type { BaseTokens } from "@/types/tokens";
import type { CalendarEvent } from "@/store/events";
import type { CalendarListItem } from "@/lib/google-calendar";
import { isoDate } from "@/lib/date-utils";

export const MOCK_ENABLED = import.meta.env.VITE_MOCK === "1";

const mockTokens = (): BaseTokens => ({
  access_token: "mock-access-token",
  refresh_token: "mock-refresh-token",
  expiresAt: Date.now() + 60 * 60 * 1000,
});

export const MOCK_GOOGLE_TOKENS: BaseTokens | null = MOCK_ENABLED
  ? mockTokens()
  : null;

/** Cali 서버 세션(사이드바 계정 표시용). 사진이 없으면 이름 첫 글자가 뜬다 */
export const MOCK_SESSION: { token: string; user: PublicUser } | null =
  MOCK_ENABLED
    ? {
        token: "mock-session-token",
        user: {
          id: 1,
          email: "cali.demo@gmail.com",
          name: "칼리 데모",
          pictureUrl: null,
        },
      }
    : null;

/** dayOffset일 뒤 hour:min의 ISO 문자열 */
function at(dayOffset: number, hour: number, min = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

/** dayOffset일 뒤 로컬 날짜(YYYY-MM-DD). toISOString은 UTC라 한국 오전 9시 전엔 어제가 된다 */
function dayKey(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

export const MOCK_CALENDARS: CalendarListItem[] = [
  {
    id: "primary",
    summary: "내 캘린더",
    primary: true,
    backgroundColor: "#ec91d3",
  },
  { id: "work", summary: "회사", backgroundColor: "#5b9bd5" },
];

export const MOCK_EVENTS: CalendarEvent[] = MOCK_ENABLED
  ? [
      {
        id: "m1",
        title: "팀 스탠드업",
        startTime: at(0, 10),
        endTime: at(0, 10, 30),
        isAllDay: false,
        calendarColor: "#5b9bd5",
        calendarId: "work",
        location: "회의실 A",
      },
      {
        id: "m2",
        title: "점심 약속",
        startTime: at(0, 12, 30),
        endTime: at(0, 13, 30),
        isAllDay: false,
        calendarColor: "#ec91d3",
        calendarId: "primary",
      },
      {
        id: "m3",
        title: "코드 리뷰",
        startTime: at(0, 15),
        endTime: at(0, 16),
        isAllDay: false,
        calendarColor: "#5b9bd5",
        calendarId: "work",
      },
      {
        id: "m4",
        title: "치과 예약",
        startTime: at(1, 14),
        endTime: at(1, 15),
        isAllDay: false,
        calendarColor: "#ec91d3",
        calendarId: "primary",
        location: "강남",
      },
      // 장소 표시 확인용 — 주소가 있는 장소는 상세에서 지도 링크가 뜨고, 리스트에는 상호명만 보인다
      {
        id: "m10",
        title: "카페 미팅",
        startTime: at(0, 16, 30),
        endTime: at(0, 17, 30),
        isAllDay: false,
        calendarColor: "#ec91d3",
        calendarId: "primary",
        location: "스타벅스 역삼역점, 서울특별시 강남구 테헤란로 123",
      },
      {
        id: "m5",
        title: "프로젝트 마감",
        startTime: dayKey(3),
        endTime: dayKey(3),
        isAllDay: true,
        calendarColor: "#5b9bd5",
        calendarId: "work",
      },
      {
        id: "m6",
        title: "주간 회고",
        startTime: at(5, 17),
        endTime: at(5, 18),
        isAllDay: false,
        calendarColor: "#5b9bd5",
        calendarId: "work",
      },
      // 멀티데이 일정 (연속 막대 확인용) — 종일 end.date는 배타적이라 하루 더 줌
      {
        id: "m7",
        title: "워크샵 출장",
        startTime: dayKey(-1),
        endTime: dayKey(4),
        isAllDay: true,
        calendarColor: "#5b9bd5",
        calendarId: "work",
      },
      {
        id: "m8",
        title: "전사 행사",
        startTime: dayKey(1),
        endTime: dayKey(3),
        isAllDay: true,
        calendarColor: "#ec91d3",
        calendarId: "primary",
      },
      // 긴 제목 (셀 폭 넘침 회귀 확인용) — min-width:0 없으면 이 칸이 열을 늘려 캘린더가 넘침
      {
        id: "m9",
        title: "분기 마감 전 최종 점검 및 팀 회식 장소 예약하기",
        startTime: at(2, 18),
        endTime: at(2, 19),
        isAllDay: false,
        calendarColor: "#ec91d3",
        calendarId: "primary",
      },
    ]
  : [];

export const MOCK_TODO_LISTS: TodoList[] = MOCK_ENABLED
  ? [
      { id: 1, name: "작업" },
      { id: 2, name: "개인" },
      { id: 3, name: "쇼핑" }, // 미완료 할일 없는 목록(빈 카테고리 확인용)
    ]
  : [];

const mockTodo = (
  t: Partial<Todo> & Pick<Todo, "id" | "listId" | "title">,
): Todo => ({
  memo: "",
  dueDate: null,
  importance: "normal",
  repeat: null,
  reminderAt: null,
  completedAt: null,
  checklist: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...t,
});

export const MOCK_TODOS: Todo[] = MOCK_ENABLED
  ? [
      mockTodo({
        id: 1,
        listId: 1,
        title: "분기 보고서 작성 및 팀 리뷰 미팅 자료 정리하기",
        importance: "high",
        dueDate: dayKey(0),
        reminderAt: new Date(`${dayKey(0)}T09:00:00`).toISOString(),
      }),
      mockTodo({ id: 2, listId: 1, title: "이메일 회신" }),
      mockTodo({
        id: 3,
        listId: 1,
        title: "주간 미팅 준비",
        dueDate: dayKey(2),
        repeat: {
          type: "weekly",
          interval: 1,
          weekdays: [weekdayOf(dayKey(2))],
        },
        memo: "회의실 예약 확인",
        checklist: [
          { id: 1, title: "자료 정리", checkedAt: new Date().toISOString() },
          { id: 2, title: "발표 연습", checkedAt: null },
        ],
      }),
      mockTodo({ id: 4, listId: 2, title: "운동 가기", dueDate: dayKey(1) }),
    ]
  : [];
