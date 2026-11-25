import { describe, expect, it } from "vitest";
import { sessionStoreKey } from "./account";

describe("sessionStoreKey", () => {
  it("운영 서버는 예전 키 그대로(이미 로그인한 사람 유지)", () => {
    expect(sessionStoreKey("https://cali-api.jinu.io")).toBe("server.session");
  });

  it("다른 서버(로컬 개발)는 따로 둬서 서로 세션을 지우지 않는다", () => {
    expect(sessionStoreKey("http://localhost:8787")).toBe(
      "server.session@http://localhost:8787",
    );
  });
});
