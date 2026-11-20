import { afterEach, describe, expect, it, vi } from "vitest";
import type { Todo } from "@cali/shared";
import {
  sortChecklistByDone,
  repeatLabel,
  monthlyOptions,
  reanchorRepeat,
  buildTodoBody,
  todoEditFormState,
  EMPTY_TODO_FORM,
  type TodoFormState,
  cleanChecklistItems,
} from "./todo-form";

describe("sortChecklistByDone", () => {
  it("미완료를 먼저(순서 유지), 완료는 체크 시각 오름차순(최근이 맨 아래)", () => {
    const items = [
      { title: "완료-나중", checkedAt: "2026-06-15T12:00:00.000Z" },
      { title: "미완료1", checkedAt: null },
      { title: "완료-먼저", checkedAt: "2026-06-15T09:00:00.000Z" },
      { title: "미완료2", checkedAt: null },
    ];
    expect(sortChecklistByDone(items).map((i) => i.title)).toEqual([
      "미완료1",
      "미완료2",
      "완료-먼저",
      "완료-나중",
    ]);
  });

  it("원본 배열을 변형하지 않는다", () => {
    const items = [
      { title: "a", checkedAt: "2026-06-15T12:00:00.000Z" },
      { title: "b", checkedAt: null },
    ];
    const copy = [...items];
    sortChecklistByDone(items);
    expect(items).toEqual(copy);
  });
});

describe("repeatLabel", () => {
  it("종류·조건별 설명", () => {
    expect(repeatLabel({ type: "daily", days: "all" })).toBe("매일");
    expect(repeatLabel({ type: "daily", days: "weekdays" })).toBe("평일마다");
    expect(repeatLabel({ type: "weekly", interval: 1, weekdays: [1, 3] })).toBe(
      "매주 월·수",
    );
    expect(repeatLabel({ type: "weekly", interval: 2, weekdays: [5] })).toBe(
      "2주마다 금",
    );
    expect(
      repeatLabel({
        type: "monthly",
        interval: 1,
        on: { kind: "day", day: 1 },
      }),
    ).toBe("매월 첫날");
    expect(
      repeatLabel({ type: "monthly", interval: 3, on: { kind: "lastDay" } }),
    ).toBe("3개월마다 마지막 날");
    expect(
      repeatLabel({
        type: "monthly",
        interval: 1,
        on: { kind: "weekday", week: 3, weekday: 4 },
      }),
    ).toBe("매월 셋째 주 목요일");
    expect(repeatLabel({ type: "yearly", month: 11, day: 20 })).toBe(
      "매년 11월 20일",
    );
  });
});

describe("monthlyOptions", () => {
  it("마감일에서 날짜·첫날·마지막 날·N번째 요일을 뽑는다", () => {
    // 2026-11-19 = 셋째 주 목요일
    expect(monthlyOptions("2026-11-19")).toEqual([
      { kind: "day", day: 19 },
      { kind: "day", day: 1 },
      { kind: "lastDay" },
      { kind: "weekday", week: 3, weekday: 4 },
    ]);
  });
  it("1일이면 날짜와 첫날이 겹치지 않게, 29일 이후는 마지막 주", () => {
    expect(monthlyOptions("2026-11-01")).toHaveLength(3);
    expect(monthlyOptions("2026-11-30").at(-1)).toEqual({
      kind: "weekday",
      week: -1,
      weekday: 1,
    });
  });
});

describe("reanchorRepeat", () => {
  it("마감일에서 뽑은 값(매월 날짜·N번째 요일, 매년)은 새 마감일을 따라간다", () => {
    expect(
      reanchorRepeat(
        { type: "monthly", interval: 2, on: { kind: "day", day: 19 } },
        "2026-11-25",
      ),
    ).toEqual({ type: "monthly", interval: 2, on: { kind: "day", day: 25 } });
    expect(
      reanchorRepeat({ type: "yearly", month: 3, day: 1 }, "2026-11-25"),
    ).toEqual({ type: "yearly", month: 11, day: 25 });
  });
  it("직접 고른 요일·첫날·마지막 날은 그대로", () => {
    const weekly = { type: "weekly", interval: 1, weekdays: [1] } as const;
    expect(reanchorRepeat({ ...weekly, weekdays: [1] }, "2026-11-25")).toEqual(
      weekly,
    );
    const last = {
      type: "monthly",
      interval: 1,
      on: { kind: "lastDay" },
    } as const;
    expect(reanchorRepeat(last, "2026-11-25")).toEqual(last);
  });
});

describe("buildTodoBody", () => {
  const base: TodoFormState = { ...EMPTY_TODO_FORM, mode: "create", listId: 7 };
  afterEach(() => vi.useRealTimers());

  it("title·memo를 다듬고 빈 칸은 null로 보낸다", () => {
    expect(
      buildTodoBody({ ...base, title: "  회의  ", memo: " 메모 " }),
    ).toEqual({
      listId: 7,
      title: "회의",
      memo: "메모",
      dueDate: null,
      importance: "normal",
      repeat: null,
      reminderAt: null,
      checklist: [],
    });
  });

  it("알림은 로컬 날짜·시각을 UTC ISO로", () => {
    const body = buildTodoBody({
      ...base,
      title: "x",
      reminderEnabled: true,
      reminderDate: "2026-06-20",
      reminderTime: "15:00",
    });
    expect(body.reminderAt).toBe(new Date(2026, 5, 20, 15, 0).toISOString());
  });

  it("알림을 꺼 두면 날짜가 있어도 null", () => {
    expect(
      buildTodoBody({ ...base, title: "x", reminderDate: "2026-06-20" })
        .reminderAt,
    ).toBeNull();
  });

  it("반복이면 마감일을 첫 회차로, 마감일이 없으면 오늘부터", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 10)); // 월요일
    const repeat = { type: "weekly", interval: 1, weekdays: [3] } as const;
    const body = buildTodoBody({
      ...base,
      title: "x",
      repeatEnabled: true,
      repeat: { ...repeat, weekdays: [3] },
    });
    expect(body.repeat).toEqual(repeat);
    expect(body.dueDate).toBe("2026-06-17"); // 그 주 수요일
  });

  it("마감일이 패턴에 안 맞으면 그 뒤 첫 맞는 날로", () => {
    expect(
      buildTodoBody({
        ...base,
        title: "x",
        dueDate: "2026-11-21", // 토
        repeatEnabled: true,
        repeat: { type: "daily", days: "weekdays" },
      }).dueDate,
    ).toBe("2026-11-23");
  });

  it("반복을 꺼 두면 고른 값이 있어도 보내지 않는다", () => {
    const body = buildTodoBody({
      ...base,
      title: "x",
      dueDate: "2026-11-21",
      repeat: { type: "daily", days: "weekdays" },
    });
    expect(body.repeat).toBeNull();
    expect(body.dueDate).toBe("2026-11-21");
  });
});

describe("todoEditFormState", () => {
  it("할일 → 폼(알림은 로컬 시각, 체크리스트는 체크 여부)", () => {
    const reminder = new Date(2026, 5, 20, 9, 30);
    const todo: Todo = {
      id: 3,
      listId: 7,
      title: "보고서",
      memo: "초안",
      dueDate: "2026-06-21",
      importance: "high",
      repeat: { type: "monthly", interval: 2, on: { kind: "day", day: 21 } },
      reminderAt: reminder.toISOString(),
      completedAt: null,
      checklist: [
        { id: 1, title: "끝", checkedAt: "2026-06-15T00:00:00.000Z" },
        { id: 2, title: "할 것", checkedAt: null },
      ],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const form = todoEditFormState(todo);
    expect(form).toMatchObject({
      mode: "edit",
      listId: 7,
      taskId: 3,
      dueDate: "2026-06-21",
      importance: "high",
      repeatEnabled: true,
      repeat: todo.repeat,
      reminderEnabled: true,
      reminderDate: "2026-06-20",
      reminderTime: "09:30",
    });
    expect(form.checklistItems).toEqual([
      { id: 2, title: "할 것", checked: false },
      { id: 1, title: "끝", checked: true },
    ]);
    // 폼을 그대로 저장하면 같은 할일이 된다
    expect(buildTodoBody(form)).toMatchObject({
      dueDate: todo.dueDate,
      reminderAt: todo.reminderAt,
      repeat: todo.repeat,
    });
  });
});

describe("cleanChecklistItems", () => {
  it("내용 없는 항목은 저장하지 않는다", () => {
    // 폼에서 항목을 추가하면 빈 칸이 먼저 생긴다 — 그대로 두고 저장해도 남지 않아야 한다
    const items = [
      { title: "우유 사기", checked: false },
      { title: "", checked: false },
      { title: "빵 사기", checked: false },
      { title: "   ", checked: false },
    ];
    expect(cleanChecklistItems(items).map((i) => i.title)).toEqual([
      "우유 사기",
      "빵 사기",
    ]);
  });

  it("앞뒤 공백을 다듬고 체크 상태와 id는 보존한다", () => {
    expect(
      cleanChecklistItems([{ id: 4, title: "  우유  ", checked: true }]),
    ).toEqual([{ id: 4, title: "우유", checked: true }]);
  });

  it("원본을 건드리지 않는다", () => {
    const items = [{ title: "  우유  ", checked: false }];
    cleanChecklistItems(items);
    expect(items[0]!.title).toBe("  우유  ");
  });
});
