import { describe, expect, it } from "vitest";
import {
  sortChecklistByDone,
  recurrenceLabel,
  buildTodoRecurrence,
  buildTodoTaskFromForm,
  EMPTY_TODO_FORM,
  type TodoFormState,
} from "./todo-form";

describe("sortChecklistByDone", () => {
  it("미완료를 먼저, 완료는 완료시각 오름차순(최근 완료가 맨 아래)", () => {
    const items = [
      { displayName: "완료-나중", isChecked: true, checkedDateTime: { dateTime: "2026-06-15T12:00:00Z" } },
      { displayName: "미완료", isChecked: false },
      { displayName: "완료-먼저", isChecked: true, checkedDateTime: { dateTime: "2026-06-15T09:00:00Z" } },
    ];
    expect(sortChecklistByDone(items).map((i) => i.displayName))
      .toEqual(["미완료", "완료-먼저", "완료-나중"]);
  });

  it("원본 배열을 변형하지 않는다", () => {
    const items = [{ displayName: "a", isChecked: true }, { displayName: "b", isChecked: false }];
    const copy = [...items];
    sortChecklistByDone(items);
    expect(items).toEqual(copy);
  });
});

describe("recurrenceLabel", () => {
  it("반복 타입 라벨", () => {
    expect(recurrenceLabel("daily")).toBe("매일");
    expect(recurrenceLabel("weekly")).toBe("매주");
    expect(recurrenceLabel("absoluteMonthly")).toBe("매월");
    expect(recurrenceLabel("absoluteYearly")).toBe("매년");
  });
});

describe("buildTodoRecurrence", () => {
  it("반복 꺼짐: create는 undefined, edit는 null", () => {
    expect(buildTodoRecurrence({ ...EMPTY_TODO_FORM, mode: "create", repeatEnabled: false })).toBeUndefined();
    expect(buildTodoRecurrence({ ...EMPTY_TODO_FORM, mode: "edit", repeatEnabled: false })).toBeNull();
  });

  it("주간 반복은 dueDate 요일을 daysOfWeek에 넣는다", () => {
    const r = buildTodoRecurrence({
      ...EMPTY_TODO_FORM, repeatEnabled: true, repeatType: "weekly", repeatInterval: 2, dueDate: "2026-06-15",
    });
    expect(r?.pattern.type).toBe("weekly");
    expect(r?.pattern.interval).toBe(2);
    expect((r?.pattern as { daysOfWeek?: string[] }).daysOfWeek).toEqual(["monday"]); // 2026-06-15 = 월
    expect((r?.range as { startDate?: string }).startDate).toBe("2026-06-15");
  });
});

describe("buildTodoTaskFromForm", () => {
  const base: TodoFormState = { ...EMPTY_TODO_FORM, mode: "create", listId: "L" };

  it("title을 trim하고 dueDateTime/body를 구성한다", () => {
    const task = buildTodoTaskFromForm({ ...base, title: "  회의  ", dueDate: "2026-06-20", memo: " 메모 " });
    expect(task.title).toBe("회의");
    expect(task.importance).toBe("normal");
    expect(task.dueDateTime).toEqual({ dateTime: "2026-06-20T00:00:00.0000000", timeZone: "UTC" });
    expect(task.body).toEqual({ content: "메모", contentType: "text" });
  });

  it("메모가 비면 body를 넣지 않는다", () => {
    const task = buildTodoTaskFromForm({ ...base, title: "x", memo: "   " });
    expect(task.body).toBeUndefined();
  });

  it("알림 켜짐: isReminderOn=true, UTC timeZone", () => {
    const task = buildTodoTaskFromForm({
      ...base, title: "x", reminderEnabled: true, reminderDate: "2026-06-20", reminderTime: "15:00",
    });
    expect(task.isReminderOn).toBe(true);
    expect(task.reminderDateTime?.timeZone).toBe("UTC");
  });

  it("수정 모드 + 반복 변경 없음 → recurrence를 PATCH에 넣지 않는다(서버 값 보존)", () => {
    const task = buildTodoTaskFromForm({
      ...EMPTY_TODO_FORM, mode: "edit", listId: "L", taskId: "T", title: "x",
      repeatEnabled: false,
      repeatBaseline: { enabled: false, type: "daily", interval: 1 },
    });
    expect("recurrence" in task).toBe(false);
  });
});
