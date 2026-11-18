import { describe, expect, it } from "vitest";
import { findMissingScopes } from "./oauth";

const CALENDAR = "https://www.googleapis.com/auth/calendar";
const EMAIL = "https://www.googleapis.com/auth/userinfo.email";

describe("findMissingScopes", () => {
  it("필수 권한이 모두 승인되면 빈 배열", () => {
    expect(findMissingScopes(`${CALENDAR} ${EMAIL}`, [CALENDAR])).toEqual([]);
  });

  it("사용자가 캘린더 체크를 해제하면 누락으로 잡는다", () => {
    expect(findMissingScopes(EMAIL, [CALENDAR])).toEqual([CALENDAR]);
  });

  it("하위 스코프(calendar.events)는 calendar를 대신하지 못한다", () => {
    const partial = "https://www.googleapis.com/auth/calendar.events";
    expect(findMissingScopes(partial, [CALENDAR])).toEqual([CALENDAR]);
  });

  it("Microsoft처럼 전체 URI로 돌려줘도 인식한다", () => {
    const granted = "https://graph.microsoft.com/Tasks.ReadWrite https://graph.microsoft.com/User.Read";
    expect(findMissingScopes(granted, ["Tasks.ReadWrite"])).toEqual([]);
  });

  it("대소문자 차이를 무시한다", () => {
    expect(findMissingScopes("tasks.readwrite", ["Tasks.ReadWrite"])).toEqual([]);
  });

  it("구분자가 여러 공백/개행이어도 파싱한다", () => {
    expect(findMissingScopes(`  ${CALENDAR}\n\t${EMAIL} `, [CALENDAR])).toEqual([]);
  });

  it("scope가 없으면 판별 근거가 없으므로 통과시킨다", () => {
    // 응답에 scope가 없다는 이유로 로그인을 막으면 오탐이 더 치명적이다.
    expect(findMissingScopes(undefined, [CALENDAR])).toEqual([]);
    expect(findMissingScopes("   ", [CALENDAR])).toEqual([]);
  });

  it("누락된 것만 골라 돌려준다", () => {
    expect(findMissingScopes(EMAIL, [CALENDAR, EMAIL])).toEqual([CALENDAR]);
  });
});
