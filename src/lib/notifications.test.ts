import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("./tauri-store", () => ({ isTauri: () => true }));

const { scheduleNotification, cancelNotification, cancelNotificationsByPrefix } =
  await import("./notifications");

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** setTimeout이 32비트로 잘리는 경계 (약 24.86일) */
const MAX_TIMEOUT_MS = 2_147_483_647;

function at(msFromNow: number) {
  return { id: "event-1", title: "팀 미팅", body: "15분 후 시작", time: Date.now() + msFromNow };
}

describe("scheduleNotification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invoke.mockClear();
  });
  afterEach(() => {
    cancelNotificationsByPrefix("event-");
    vi.useRealTimers();
  });

  it("예정 시각이 되면 한 번 발송한다", async () => {
    await scheduleNotification(at(30 * MINUTE));

    await vi.advanceTimersByTimeAsync(30 * MINUTE - 1);
    expect(invoke).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("send_os_notification", {
      title: "팀 미팅",
      body: "15분 후 시작",
    });
  });

  it("setTimeout 상한(약 24.8일)을 넘는 일정이 즉시 발송되지 않는다", async () => {
    // 달력에서 다음 달로 넘어가면 두 달 뒤 일정이 범위에 섞여 들어온다.
    // 예전에는 이 지연이 32비트로 잘려 등록하자마자 알림이 울렸다.
    await scheduleNotification(at(51 * DAY));

    await vi.advanceTimersByTimeAsync(1000);
    expect(invoke).not.toHaveBeenCalled();

    // 상한 직후에도 아직 울리면 안 된다 (남은 시간으로 다시 걸려 있어야 함)
    await vi.advanceTimersByTimeAsync(MAX_TIMEOUT_MS);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("상한을 넘는 일정도 제 시각에는 정확히 한 번 발송한다", async () => {
    await scheduleNotification(at(51 * DAY));

    await vi.advanceTimersByTimeAsync(51 * DAY - 1);
    expect(invoke).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("같은 id로 다시 걸면 이전 타이머를 대체한다 (중복 발송 없음)", async () => {
    await scheduleNotification(at(10 * MINUTE));
    await scheduleNotification(at(10 * MINUTE));
    await scheduleNotification(at(10 * MINUTE));

    await vi.advanceTimersByTimeAsync(11 * MINUTE);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("이미 지난 시각은 등록하지 않는다", async () => {
    await scheduleNotification(at(-MINUTE));

    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("취소하면 발송하지 않는다", async () => {
    await scheduleNotification(at(10 * MINUTE));
    cancelNotification("event-1");

    await vi.advanceTimersByTimeAsync(11 * MINUTE);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("상한을 넘겨 대기 중인 것도 취소된다", async () => {
    await scheduleNotification(at(51 * DAY));
    cancelNotification("event-1");

    await vi.advanceTimersByTimeAsync(52 * DAY);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("접두사 취소는 해당 종류만 지운다", async () => {
    await scheduleNotification({ ...at(5 * MINUTE), id: "event-a" });
    await scheduleNotification({ ...at(5 * MINUTE), id: "todo-a", title: "할일" });

    cancelNotificationsByPrefix("event-");

    await vi.advanceTimersByTimeAsync(6 * MINUTE);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("send_os_notification", expect.objectContaining({ title: "할일" }));
    cancelNotificationsByPrefix("todo-");
  });
});
