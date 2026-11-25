import { describe, expect, it } from "vitest";
import { cleanNumberInput, parseNumberInput } from "./number-input";

describe("cleanNumberInput", () => {
  it("숫자가 아닌 글자는 버린다", () => {
    expect(cleanNumberInput("abc")).toBe("");
    expect(cleanNumberInput("한글12")).toBe("12");
    expect(cleanNumberInput("1e5")).toBe("15");
    expect(cleanNumberInput("0x1F")).toBe("01");
  });

  it("부호는 맨 앞 하나, 소수점은 첫 하나만", () => {
    expect(cleanNumberInput("-3.5")).toBe("-3.5");
    expect(cleanNumberInput("--3")).toBe("-3");
    expect(cleanNumberInput("3-")).toBe("3");
    expect(cleanNumberInput("1.2.3")).toBe("1.23");
  });

  it("쉼표·전각 숫자·공백 정리", () => {
    expect(cleanNumberInput("1,000")).toBe("1000");
    expect(cleanNumberInput("１２")).toBe("12");
    expect(cleanNumberInput(" 42 ")).toBe("42");
  });
});

describe("parseNumberInput", () => {
  it("쓰는 중인 글자는 값이 아니다", () => {
    expect(parseNumberInput("")).toBeUndefined();
    expect(parseNumberInput("-")).toBeUndefined();
    expect(parseNumberInput(".")).toBeUndefined();
    expect(parseNumberInput("-.")).toBeUndefined();
  });

  it("숫자로 바꾼다", () => {
    expect(parseNumberInput("-3.5")).toBe(-3.5);
    expect(parseNumberInput("1.")).toBe(1);
    expect(parseNumberInput(".5")).toBe(0.5);
    expect(parseNumberInput("007")).toBe(7);
  });
});
