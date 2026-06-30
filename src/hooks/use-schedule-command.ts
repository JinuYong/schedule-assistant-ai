"use client";

import { useState, useMemo, useEffect, useCallback, type KeyboardEvent } from "react";
import { parseScheduleText, parseEditCommand, type ParsedEventChanges } from "@/lib/claude";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  listEventsInRange,
  buildEventFromParsed,
  type CalendarListItem,
  type GCalEvent,
} from "@/lib/google-calendar";
import { CalendarEvent, mapGCalEvent } from "@/store/events";
import { matchEventsByText, matchCalendar, parseDateHint } from "@/lib/event-match";

export type CommandStatus = "idle" | "loading" | "done" | "error";
export type CommandAction = "create" | "update" | "delete";

export interface ScheduleCommandDeps {
  /** 자동완성 매칭 대상이 되는 현재 로드된 이벤트들 */
  events: CalendarEvent[];
  /** 신규 생성 시 캘린더 매칭에 사용 */
  calendars: CalendarListItem[];
  /** 캘린더 미지정 시 사용할 기본 캘린더 ID (설정의 기본 캘린더 또는 primary) */
  defaultCalendarId: string;
  /** 유효한 Google access token 확보 (없으면 null) */
  getToken: () => Promise<string | null>;
  /** 생성/수정/삭제 성공 후 갱신 처리 */
  onMutated: (action: CommandAction) => void | Promise<void>;
  /** 에러 메시지 표시 (없으면 무시) */
  onError?: (msg: string) => void;
}

/**
 * 자연어 입력창의 명령 처리 훅 (일정탭 quick 입력 / 플로팅 창 공유).
 *
 * 흐름:
 * - 입력 중 기존 일정과 매칭되면 자동완성 후보 노출(AI 호출 없음)
 * - 후보를 ↑↓로 고른 뒤 Enter/Tab → 해당 일정을 "대상"으로 지정(lock, 제출 아님)
 * - 대상 지정 상태에서 명령("삭제", "오후 7시로 변경")을 입력하고 Enter → 수정/삭제 실행
 * - 대상 미지정 상태에서 Enter → 신규 생성
 */
export function useScheduleCommand(deps: ScheduleCommandDeps) {
  const { events, calendars, defaultCalendarId, getToken, onMutated, onError } = deps;
  const [input, setInputState] = useState("");
  const [status, setStatus] = useState<CommandStatus>("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const [lockedTarget, setLockedTarget] = useState<CalendarEvent | null>(null);

  // 날짜 표현이 있으면 그날 일정을 직접 조회 (로드 안 된 달도 매칭되도록)
  const dateHint = useMemo(() => parseDateHint(input), [input]);
  const [dateEvents, setDateEvents] = useState<CalendarEvent[]>([]);
  const [dateLoading, setDateLoading] = useState(false);

  useEffect(() => {
    if (!dateHint) {
      setDateEvents([]);
      setDateLoading(false);
      return;
    }
    let cancelled = false;
    setDateLoading(true);
    const timer = setTimeout(async () => {
      const token = await getToken();
      if (cancelled) return;
      if (!token) {
        setDateLoading(false);
        return;
      }
      try {
        const min = new Date(`${dateHint}T00:00:00`).toISOString();
        const max = new Date(`${dateHint}T23:59:59`).toISOString();
        const raw = await listEventsInRange(token, min, max);
        if (!cancelled) setDateEvents(raw.map(mapGCalEvent));
      } catch {
        /* 조회 실패는 무시 */
      } finally {
        if (!cancelled) setDateLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dateHint, getToken]);

  const matches = useMemo(() => {
    if (lockedTarget || dismissed) return [];
    return matchEventsByText(input, dateHint ? dateEvents : events);
  }, [input, events, dateEvents, dateHint, dismissed, lockedTarget]);
  // 후보가 있거나, 날짜 조회 중이면 드롭다운(로딩 행 포함) 노출
  const loading = dateLoading && !lockedTarget && !dismissed;
  const showDropdown = (matches.length > 0 || loading) && status !== "loading";

  const reset = useCallback(() => {
    setInputState("");
    setActiveIndex(-1);
    setDismissed(false);
    setLockedTarget(null);
  }, []);

  const setInput = useCallback((value: string) => {
    setInputState(value);
    setActiveIndex(-1);
    setDismissed(false);
  }, []);

  /** 후보를 수정/삭제 대상으로 지정 (입력은 비우고 명령 대기) */
  const lockTarget = useCallback((ev: CalendarEvent) => {
    setLockedTarget(ev);
    setInputState("");
    setActiveIndex(-1);
    setDismissed(false);
  }, []);

  const clearLock = useCallback(() => setLockedTarget(null), []);

  const submit = useCallback(async () => {
    if (status === "loading") return;
    const text = input.trim();

    if (lockedTarget) {
      if (!text) {
        onError?.("수정 또는 삭제 명령을 입력하세요 (예: 삭제, 오후 7시로 변경)");
        return;
      }
      setStatus("loading");
      try {
        const token = await getToken();
        if (!token) throw new Error("Google 계정 연결이 필요합니다.");
        const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
        const cmd = await parseEditCommand(text, now, {
          title: lockedTarget.title,
          startTime: lockedTarget.startTime,
          endTime: lockedTarget.endTime,
          location: lockedTarget.location,
          isAllDay: lockedTarget.isAllDay,
        });
        if (!cmd) throw new Error("명령을 이해하지 못했습니다.");
        const calId = lockedTarget.calendarId ?? "primary";
        if (cmd.action === "delete") {
          await deleteEvent(token, lockedTarget.id, calId);
          reset();
          setStatus("done");
          await onMutated("delete");
        } else {
          const body = buildUpdateBody(cmd.changes, lockedTarget);
          if (Object.keys(body).length === 0) throw new Error("수정할 내용을 인식하지 못했습니다.");
          await updateEvent(token, lockedTarget.id, body, calId);
          reset();
          setStatus("done");
          await onMutated("update");
        }
        setTimeout(() => setStatus("idle"), 1500);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "처리에 실패했습니다.";
        console.error("[schedule-command] 수정/삭제 실패:", e);
        onError?.(msg);
        setStatus("error");
        setTimeout(() => setStatus("idle"), 2000);
      }
      return;
    }

    // 신규 생성
    if (!text) return;
    setStatus("loading");
    try {
      const token = await getToken();
      if (!token) throw new Error("Google 계정 연결이 필요합니다.");
      const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      const parsed = await parseScheduleText(text, now, calendars.map((c) => c.summary));
      if (!parsed) throw new Error("파싱 실패");
      const matched = parsed.calendarName ? matchCalendar(parsed.calendarName, calendars) : undefined;
      await createEvent(token, buildEventFromParsed(parsed), matched?.id ?? defaultCalendarId);
      reset();
      setStatus("done");
      await onMutated("create");
      setTimeout(() => setStatus("idle"), 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "일정 추가에 실패했습니다.";
      console.error("[schedule-command] 생성 실패:", e);
      onError?.(msg);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }, [input, status, lockedTarget, getToken, calendars, defaultCalendarId, onMutated, onError, reset]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (lockedTarget) {
        // 대상 지정 상태: 빈 입력에서 Backspace 또는 Escape로 대상 해제
        if ((e.key === "Backspace" && input === "") || e.key === "Escape") {
          e.preventDefault();
          clearLock();
        }
        return;
      }
      if (!showDropdown) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === "Enter" || e.key === "Tab") {
        // 후보가 하이라이트된 상태에서 Enter/Tab → 제출이 아니라 대상 지정
        if (activeIndex >= 0) {
          e.preventDefault();
          lockTarget(matches[activeIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
        setActiveIndex(-1);
      }
    },
    [lockedTarget, input, showDropdown, matches, activeIndex, clearLock, lockTarget]
  );

  return {
    input,
    setInput,
    status,
    matches,
    activeIndex,
    setActiveIndex,
    showDropdown,
    loading,
    lockedTarget,
    lockTarget,
    clearLock,
    handleKeyDown,
    submit,
    reset,
  };
}

/** 수정 명령의 변경분(ParsedEventChanges)을 Google Calendar PATCH 본문으로 변환 */
function buildUpdateBody(changes: ParsedEventChanges, target: CalendarEvent): Partial<GCalEvent> {
  const body: Partial<GCalEvent> = {};
  if (changes.title) body.summary = changes.title;
  if (changes.location !== undefined) body.location = changes.location || undefined;

  const timeChanged =
    changes.startTime !== undefined ||
    changes.endTime !== undefined ||
    changes.isAllDay !== undefined;
  if (timeChanged) {
    const isAllDay = changes.isAllDay ?? target.isAllDay;
    const start = changes.startTime ?? target.startTime;
    const end = changes.endTime ?? target.endTime;
    if (isAllDay) {
      body.start = { date: start.split("T")[0] };
      body.end = { date: end.split("T")[0] };
    } else {
      body.start = { dateTime: start, timeZone: "Asia/Seoul" };
      body.end = { dateTime: end, timeZone: "Asia/Seoul" };
    }
  }
  return body;
}
