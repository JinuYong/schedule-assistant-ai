import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import {
  listEventsInRange,
  type CalendarListItem,
} from "@/lib/google-calendar";
import { CalendarEvent, mapGCalEvent } from "@/store/events";
import {
  matchEventsByText,
  matchCalendar,
  parseDateHint,
} from "@/lib/event-match";
import { canEditEvent } from "@/lib/calendar-access";
import type { AiEntry } from "@/store/ai";

export type CommandStatus = "idle" | "loading" | "done" | "error";

export interface ScheduleCommandDeps {
  /** 자동완성 매칭 대상이 되는 현재 로드된 이벤트들 */
  events: CalendarEvent[];
  /** 수정·삭제 후보 거르기(읽기 전용 캘린더 일정 제외)에 사용 */
  calendars: CalendarListItem[];
  /** 유효한 Google access token 확보 (없으면 null) — 날짜 표현 후보 조회용 */
  getToken: () => Promise<string | null>;
  /** AI에 부탁하고 끝날 때까지 기다린다(메인 창은 store, 플로팅은 메인 창에 이벤트로) */
  ask: (text: string, target?: CalendarEvent) => Promise<AiEntry>;
  /** 에러 메시지 표시 (없으면 무시) */
  onError?: (msg: string) => void;
}

/**
 * 자연어 입력창의 명령 처리 훅 (일정탭 quick 입력 / 플로팅 창 공유).
 *
 * 흐름:
 * - 입력 중 기존 일정과 매칭되면 자동완성 후보 노출(AI 호출 없음)
 * - 후보를 ↑↓로 고른 뒤 Enter/Tab → 해당 일정을 "대상"으로 지정(lock, 제출 아님)
 * - Enter → AI에 부탁(대상이 있으면 "고른 일정"으로 함께). 무엇을 할지(추가·수정·삭제·답)는 AI가 정한다
 */
export function useScheduleCommand(deps: ScheduleCommandDeps) {
  const { events, calendars, getToken, ask, onError } = deps;
  const [input, setInputState] = useState("");
  const [status, setStatus] = useState<CommandStatus>("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const [lockedTarget, setLockedTarget] = useState<CalendarEvent | null>(null);
  /** 마지막 AI 답(입력창 아래에 보여 준다) */
  const [result, setResult] = useState<AiEntry | null>(null);

  // 날짜 표현이 있으면 그날 일정을 직접 조회 (로드 안 된 달도 매칭되도록)
  const dateHint = useMemo(() => parseDateHint(input), [input]);
  // 조회 결과를 어느 날짜 것인지와 함께 둔다. 지금 날짜의 결과가 아직 없으면 조회 중이다
  // (effect 안에서 상태를 비우거나 로딩을 켜지 않고 렌더 때 계산 — react-hooks set-state-in-effect)
  const [dateResult, setDateResult] = useState<{
    hint: string;
    events: CalendarEvent[];
  } | null>(null);
  const dateLoading = !!dateHint && dateResult?.hint !== dateHint;

  useEffect(() => {
    if (!dateHint) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const token = await getToken();
      if (cancelled) return;
      let found: CalendarEvent[] = [];
      if (token) {
        try {
          const min = new Date(`${dateHint}T00:00:00`).toISOString();
          const max = new Date(`${dateHint}T23:59:59`).toISOString();
          found = (await listEventsInRange(token, min, max)).map(mapGCalEvent);
        } catch {
          /* 조회 실패는 후보 없음으로 */
        }
      }
      if (!cancelled) setDateResult({ hint: dateHint, events: found });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dateHint, getToken]);

  // 후보는 수정·삭제 대상이 되므로 읽기 전용 캘린더(공휴일 등) 일정은 뺀다
  const matches = useMemo(() => {
    if (lockedTarget || dismissed) return [];
    const pool = !dateHint
      ? events
      : dateResult?.hint === dateHint
        ? dateResult.events
        : [];
    return matchEventsByText(
      input,
      pool.filter((ev) => canEditEvent(ev, calendars)),
    );
  }, [input, events, calendars, dateResult, dateHint, dismissed, lockedTarget]);
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
  const clearResult = useCallback(() => setResult(null), []);

  const submit = useCallback(async () => {
    if (status === "loading") return;
    const text = input.trim();
    if (!text) {
      if (lockedTarget)
        onError?.("고른 일정에 할 일을 입력하세요 (예: 삭제, 오후 7시로 변경)");
      return;
    }
    setStatus("loading");
    setResult(null);
    const entry = await ask(text, lockedTarget ?? undefined);
    if (entry.status === "error") {
      onError?.(entry.error ?? "처리에 실패했습니다.");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
      return;
    }
    reset();
    setResult(entry);
    setStatus("done");
    setTimeout(() => setStatus("idle"), 1500);
  }, [input, status, lockedTarget, ask, onError, reset]);

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
    [
      lockedTarget,
      input,
      showDropdown,
      matches,
      activeIndex,
      clearLock,
      lockTarget,
    ],
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
    result,
    clearResult,
  };
}
