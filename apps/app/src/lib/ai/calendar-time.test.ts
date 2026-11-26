import { describe, expect, it } from "vitest";
import {
  fromGoogleTimes,
  kstIso,
  nowLabel,
  parseKst,
  toGoogleTimes,
  whenLabel,
} from "./calendar-time";

describe("toGoogleTimes", () => {
  it("시간 일정: 오프셋 없으면 KST, 끝이 없으면 1시간", () => {
    expect(toGoogleTimes({ start: "2026-11-27T15:00" })).toEqual({
      start: { dateTime: "2026-11-27T15:00:00+09:00", timeZone: "Asia/Seoul" },
      end: { dateTime: "2026-11-27T16:00:00+09:00", timeZone: "Asia/Seoul" },
    });
  });

  it("시간 일정: UTC로 줘도 KST로 바꿔 둔다, 끝이 시작보다 앞이면 1시간", () => {
    expect(
      toGoogleTimes({
        start: "2026-11-27T06:00:00Z",
        end: "2026-11-27T05:00:00Z",
      }),
    ).toEqual({
      start: { dateTime: "2026-11-27T15:00:00+09:00", timeZone: "Asia/Seoul" },
      end: { dateTime: "2026-11-27T16:00:00+09:00", timeZone: "Asia/Seoul" },
    });
  });

  it("종일: 끝은 포함 → Google 배타(+1일)", () => {
    expect(
      toGoogleTimes({ start: "2026-12-03", end: "2026-12-05", allDay: true }),
    ).toEqual({ start: { date: "2026-12-03" }, end: { date: "2026-12-06" } });
  });

  it("종일: 날짜만 주면 allDay를 안 줘도 종일, 끝 없으면 하루", () => {
    expect(toGoogleTimes({ start: "2026-12-03" })).toEqual({
      start: { date: "2026-12-03" },
      end: { date: "2026-12-04" },
    });
  });

  it("종일 끝 정규화: 다음 날 00:00(배타)·같은 날 23:59:59(포함) 둘 다 같은 결과", () => {
    const want = { start: { date: "2026-12-03" }, end: { date: "2026-12-06" } };
    expect(
      toGoogleTimes({
        start: "2026-12-03T00:00:00",
        end: "2026-12-06T00:00:00",
        allDay: true,
      }),
    ).toEqual(want);
    expect(
      toGoogleTimes({
        start: "2026-12-03T00:00:00+09:00",
        end: "2026-12-05T23:59:59+09:00",
        allDay: true,
      }),
    ).toEqual(want);
  });

  it("종일 하루짜리를 다음 날 00:00으로 줘도 하루", () => {
    expect(
      toGoogleTimes({
        start: "2026-12-03",
        end: "2026-12-04T00:00:00",
        allDay: true,
      }),
    ).toEqual({ start: { date: "2026-12-03" }, end: { date: "2026-12-04" } });
  });

  it("종일 끝이 시작보다 앞이면 하루", () => {
    expect(
      toGoogleTimes({ start: "2026-12-03", end: "2026-12-01", allDay: true }),
    ).toEqual({ start: { date: "2026-12-03" }, end: { date: "2026-12-04" } });
  });

  it("알 수 없는 형식은 오류", () => {
    expect(() => toGoogleTimes({ start: "내일" })).toThrow();
  });
});

describe("fromGoogleTimes", () => {
  it("종일 끝은 포함하는 마지막 날로", () => {
    expect(
      fromGoogleTimes({
        start: { date: "2026-12-03" },
        end: { date: "2026-12-06" },
      }),
    ).toEqual({ start: "2026-12-03", end: "2026-12-05", allDay: true });
  });

  it("시간 일정은 KST ISO로", () => {
    expect(
      fromGoogleTimes({
        start: { dateTime: "2026-11-30T01:00:00Z" },
        end: { dateTime: "2026-11-30T11:00:00+09:00" },
      }),
    ).toEqual({
      start: "2026-11-30T10:00:00+09:00",
      end: "2026-11-30T11:00:00+09:00",
      allDay: false,
    });
  });
});

describe("whenLabel·nowLabel", () => {
  it("시간 일정", () => {
    expect(
      whenLabel({
        start: "2026-11-30T10:00:00+09:00",
        end: "2026-11-30T11:30:00+09:00",
        allDay: false,
      }),
    ).toBe("11/30(월) 10:00~11:30");
  });

  it("종일 하루·여러 날", () => {
    expect(
      whenLabel({ start: "2026-12-03", end: "2026-12-03", allDay: true }),
    ).toBe("12/3(목) 종일");
    expect(
      whenLabel({ start: "2026-12-03", end: "2026-12-05", allDay: true }),
    ).toBe("12/3(목)~12/5(토)");
  });

  it("지금", () => {
    expect(nowLabel(parseKst("2026-11-26T11:05:00"))).toBe(
      "2026-11-26(목) 11:05",
    );
    expect(kstIso(parseKst("2026-11-26T23:30:00"))).toBe(
      "2026-11-26T23:30:00+09:00",
    );
  });
});
