import { describe, expect, it } from "vitest";
import { resolveDefaultCalendarId } from "./use-default-calendar";

const cals = [{ id: "primary" }, { id: "work" }, { id: "personal" }];

describe("resolveDefaultCalendarId", () => {
  it("저장된 기본이 목록에 있으면 그 ID", () => {
    expect(resolveDefaultCalendarId(cals, "work", "primary")).toBe("work");
  });

  it("저장값이 없으면 fallback", () => {
    expect(resolveDefaultCalendarId(cals, null, "primary")).toBe("primary");
    expect(resolveDefaultCalendarId(cals, "", "primary")).toBe("primary");
    expect(resolveDefaultCalendarId(cals, undefined, "primary")).toBe("primary");
  });

  it("저장값이 목록에 없으면(삭제된 캘린더) fallback", () => {
    expect(resolveDefaultCalendarId(cals, "deleted-cal", "primary")).toBe("primary");
  });
});
