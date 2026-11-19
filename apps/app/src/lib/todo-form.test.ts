import { afterEach, describe, expect, it, vi } from "vitest";
import type { Todo } from "@cali/shared";
import {
  sortChecklistByDone,
  recurrenceLabel,
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

describe("recurrenceLabel", () => {
  it("반복 타입 라벨", () => {
    expect(recurrenceLabel("daily")).toBe("매일");
    expect(recurrenceLabel("weekly")).toBe("매주");
    expect(recurrenceLabel("monthly")).toBe("매월");
    expect(recurrenceLabel("yearly")).toBe("매년");
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

  it("반복은 간격을 1~365로 맞추고, 마감일이 없으면 오늘을 마감일로", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 10));
    const body = buildTodoBody({
      ...base,
      title: "x",
      repeatEnabled: true,
      repeatType: "weekly",
      repeatInterval: 0,
    });
    expect(body.repeat).toEqual({ type: "weekly", interval: 1 });
    expect(body.dueDate).toBe("2026-06-15");
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
      repeat: { type: "monthly", interval: 2 },
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
      repeatType: "monthly",
      repeatInterval: 2,
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
