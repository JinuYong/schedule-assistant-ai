import { describe, expect, it } from "vitest";
import { createSingleFlight } from "./promise-cache";

describe("createSingleFlight", () => {
  it("초기 inflight는 null", () => {
    expect(createSingleFlight<number>().inflight).toBeNull();
  });

  it("실행 중에는 inflight가 설정되고 완료 후 비워진다", async () => {
    const sf = createSingleFlight<number>();
    let release!: (v: number) => void;
    const p = sf.run(() => new Promise<number>((res) => { release = res; }));

    expect(sf.inflight).not.toBeNull(); // 진행 중
    release(42);
    await expect(p).resolves.toBe(42);
    expect(sf.inflight).toBeNull(); // 완료 후 자동 해제
  });

  it("진행 중인 Promise를 공유한다 (동일 인스턴스)", () => {
    const sf = createSingleFlight<number>();
    const p = sf.run(() => new Promise<number>(() => {})); // 영원히 pending
    expect(sf.inflight).toBe(p);
  });

  it("실패해도 inflight를 비운다", async () => {
    const sf = createSingleFlight<number>();
    const p = sf.run(() => Promise.reject(new Error("boom")));
    await expect(p).rejects.toThrow("boom");
    expect(sf.inflight).toBeNull();
  });
});
