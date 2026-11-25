// 개발용 더미데이터 모드.
// `bun run dev`(VITE_MOCK=1) 로 실행하면 로그인 없이 브라우저에서
// 화면을 더미데이터로 볼 수 있다 (네트워크 호출은 건너뜀).
// 프로덕션/Tauri 빌드에는 영향 없음 (플래그가 꺼져 있으면 모든 값이 빈 값).

import {
  extractMemoText,
  normalizeMemoValues,
  weekdayOf,
  type CreateMemoBody,
  type CreateMemoPropertyBody,
  type Memo,
  type MemoProperty,
  type MemosResponse,
  type PublicUser,
  type Todo,
  type TodoList,
  type UpdateMemoBody,
  type UpdateMemoPropertyBody,
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
  // 읽기 전용(구독한 공휴일) — 일정 폼·기본 캘린더에서 빠지고, 일정은 수정·이동이 막힌다
  {
    id: "holiday",
    summary: "대한민국의 휴일",
    accessRole: "reader",
    backgroundColor: "#16a765",
  },
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
        id: "m11",
        title: "개천절",
        startTime: dayKey(2),
        endTime: dayKey(2),
        isAllDay: true,
        calendarColor: "#16a765",
        calendarId: "holiday",
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

// 메모 -----------------------------------------------------------------------

const paragraph = (text: string) => ({
  type: "paragraph",
  props: {},
  content: [{ type: "text", text, styles: {} }],
  children: [],
});
const heading = (text: string) => ({
  type: "heading",
  props: { level: 2 },
  content: [{ type: "text", text, styles: {} }],
  children: [],
});
const check = (text: string, checked: boolean) => ({
  type: "checkListItem",
  props: { checked },
  content: [{ type: "text", text, styles: {} }],
  children: [],
});

/**
 * 더미 모드용 메모 API — 서버(apps/server/src/memos/routes.ts)와 같은 규칙을 메모리에서.
 * 새로 고치면 처음 상태로 돌아간다.
 */
export function createMockMemoApi() {
  let nextId = 100;
  const properties: MemoProperty[] = [
    {
      id: 1,
      name: "분류",
      type: "select",
      options: [
        { id: "work", name: "업무", color: "blue" },
        { id: "life", name: "생활", color: "green" },
        { id: "idea", name: "아이디어", color: "purple" },
      ],
    },
    {
      id: 2,
      name: "태그",
      type: "multiSelect",
      options: [
        { id: "urgent", name: "급함", color: "red" },
        { id: "later", name: "나중에", color: "gray" },
        { id: "read", name: "읽을거리", color: "yellow" },
      ],
    },
    { id: 3, name: "날짜", type: "date", options: [] },
    { id: 4, name: "끝남", type: "checkbox", options: [] },
    { id: 5, name: "링크", type: "url", options: [] },
  ];
  const time = (dayOffset: number) => at(dayOffset, 10);
  const make = (
    id: number,
    title: string,
    content: unknown[],
    values: Memo["values"],
    dayOffset: number,
  ): Memo => {
    const text = extractMemoText(content);
    return {
      id,
      title,
      content,
      values,
      preview: text.slice(0, 120).replace(/\s+/g, " "),
      createdAt: time(dayOffset - 3),
      updatedAt: time(dayOffset),
    };
  };
  let memos: Memo[] = [
    make(
      1,
      "주간 회의록",
      [
        heading("논의"),
        paragraph("분기 보고서 초안은 금요일까지 공유"),
        check("발표 자료 정리", true),
        check("회의실 예약", false),
      ],
      { 1: "work", 2: ["urgent"], 3: dayKey(0) },
      0,
    ),
    make(
      2,
      "장보기",
      [paragraph("우유, 계란, 두부, 대파")],
      { 1: "life", 4: true },
      -1,
    ),
    make(
      3,
      "앱 아이디어",
      [
        paragraph("자연어로 메모를 찾아 주는 AI 도구"),
        {
          type: "paragraph",
          props: {},
          content: [
            { type: "text", text: "편집기는 ", styles: {} },
            {
              type: "link",
              href: "https://blocknotejs.org",
              content: [{ type: "text", text: "BlockNote", styles: {} }],
            },
            { type: "text", text: ", 저장은 ", styles: {} },
            { type: "text", text: "PATCH /memos/:id", styles: { code: true } },
          ],
          children: [],
        },
        {
          type: "codeBlock",
          props: { language: "typescript" },
          content: [
            {
              type: "text",
              text: 'const memo = await api.memo(token, id);\nconsole.log(memo.title ?? "제목 없음");',
              styles: {},
            },
          ],
          children: [],
        },
      ],
      { 1: "idea", 2: ["later", "read"], 5: "https://blocknotejs.org" },
      -2,
    ),
    make(4, "", [], {}, -5),
  ];

  const find = (id: number) => {
    const memo = memos.find((m) => m.id === id);
    if (!memo) throw new Error("없는 메모");
    return memo;
  };
  const write = (memo: Memo, body: UpdateMemoBody): Memo => {
    const content = body.content ?? memo.content;
    const text = extractMemoText(content);
    return {
      ...memo,
      title: (body.title ?? memo.title).trim(),
      content,
      values: normalizeMemoValues(properties, body.values ?? memo.values),
      preview: text.slice(0, 120).replace(/\s+/g, " "),
      updatedAt: new Date().toISOString(),
    };
  };
  const summary = (m: Memo) => ({
    id: m.id,
    title: m.title,
    values: normalizeMemoValues(properties, m.values),
    preview: m.preview,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  });

  return {
    memos: async (_token: string, query?: string): Promise<MemosResponse> => {
      const q = query?.toLowerCase();
      return {
        properties: [...properties],
        memos: memos
          .filter(
            (m) =>
              !q ||
              m.title.toLowerCase().includes(q) ||
              extractMemoText(m.content).toLowerCase().includes(q),
          )
          .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map(summary),
      };
    },
    memo: async (_token: string, id: number) => ({ memo: find(id) }),
    createMemo: async (_token: string, body: CreateMemoBody) => {
      const now = new Date().toISOString();
      const memo = write(
        {
          id: nextId++,
          title: "",
          content: [],
          values: {},
          preview: "",
          createdAt: now,
          updatedAt: now,
        },
        body,
      );
      memos = [memo, ...memos];
      return { memo };
    },
    updateMemo: async (_token: string, id: number, body: UpdateMemoBody) => {
      const memo = write(find(id), body);
      memos = memos.map((m) => (m.id === id ? memo : m));
      return { memo };
    },
    deleteMemo: async (_token: string, id: number) => {
      memos = memos.filter((m) => m.id !== id);
    },
    createMemoProperty: async (
      _token: string,
      body: CreateMemoPropertyBody,
    ) => {
      const property: MemoProperty = {
        id: nextId++,
        name: body.name,
        type: body.type,
        options:
          body.type === "select" || body.type === "multiSelect"
            ? (body.options ?? [])
            : [],
      };
      properties.push(property);
      return { property };
    },
    updateMemoProperty: async (
      _token: string,
      id: number,
      body: UpdateMemoPropertyBody,
    ) => {
      const property = properties.find((p) => p.id === id);
      if (!property) throw new Error("없는 속성");
      if (body.name) property.name = body.name;
      if (body.options)
        property.options =
          property.type === "select" || property.type === "multiSelect"
            ? body.options
            : [];
      return { property: { ...property } };
    },
    deleteMemoProperty: async (_token: string, id: number) => {
      const i = properties.findIndex((p) => p.id === id);
      if (i >= 0) properties.splice(i, 1);
    },
  };
}
