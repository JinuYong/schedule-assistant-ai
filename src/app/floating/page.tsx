"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { isTauri, storeGet } from "@/lib/tauri-store";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { hideFloatingWindow } from "@/lib/floating-window";
import { registerHotkey, unregisterHotkey } from "@/lib/hotkey";
import { getCalendarList, listEventsInRange, type CalendarListItem } from "@/lib/google-calendar";
import { useAuthStore } from "@/store/auth";
import { CalendarEvent, mapGCalEvent } from "@/store/events";
import { useScheduleCommand } from "@/hooks/use-schedule-command";
import { useDefaultCalendarId } from "@/hooks/use-default-calendar";
import { eventShortLabel } from "@/lib/event-match";
import styles from "./page.module.css";

const BASE_HEIGHT = 64;

export default function FloatingPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const refreshGoogle = useAuthStore((s) => s.refreshGoogle);
  const loadFromStore = useAuthStore((s) => s.loadFromStore);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<CalendarListItem[]>([]);
  const primaryCalendarId = calendars.find((c) => c.primary)?.id ?? "primary";
  const [defaultCalendarId, reloadDefaultCal] = useDefaultCalendarId(calendars, primaryCalendarId);

  const {
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
  } = useScheduleCommand({
    events,
    calendars,
    defaultCalendarId,
    getToken: useCallback(async () => {
      // 플로팅창은 메인 창과 별개 스토어라, 토큰이 비어 있으면 tauri-store에서 하이드레이트
      if (!useAuthStore.getState().googleTokens) await loadFromStore();
      return (await refreshGoogle())?.access_token ?? null;
    }, [refreshGoogle, loadFromStore]),
    onMutated: useCallback(async () => {
      await emit("calendar-mutated");
      setTimeout(async () => {
        if (isTauri()) await hideFloatingWindow();
      }, 1200);
    }, []),
  });

  // 자동완성용 데이터: 캐시 즉시 반영 후 토큰 있으면 최신 이벤트로 갱신
  const loadMatchData = useCallback(async () => {
    await loadFromStore(); // 메인 창에서 로그인한 최신 토큰을 플로팅창 스토어로 반영
    reloadDefaultCal();    // 설정에서 바뀐 기본 캘린더 반영
    const cached = await storeGet<CalendarEvent[]>("events.cache");
    if (cached?.length) setEvents(cached);
    const token = (await refreshGoogle())?.access_token;
    if (!token) return;
    try {
      setCalendars(await getCalendarList(token));
      const now = Date.now();
      const min = new Date(now - 7 * 86_400_000).toISOString();
      const max = new Date(now + 45 * 86_400_000).toISOString();
      const raw = await listEventsInRange(token, min, max);
      setEvents(raw.map(mapGCalEvent));
    } catch {
      /* 로드 실패 시 캐시 데이터 유지 */
    }
  }, [refreshGoogle, loadFromStore, reloadDefaultCal]);

  // 후보 드롭다운 노출 시 창 높이 확장, 닫히면 원복 (Rust setFrame 경유)
  useEffect(() => {
    if (!isTauri()) return;
    let height = BASE_HEIGHT;
    if (showDropdown) {
      if (matches.length > 0) {
        const n = Math.min(matches.length, 5);
        height = 6 + 52 + 6 + (28 + n * 37) + 6;
      } else {
        height = 6 + 52 + 6 + 2 * 33 + 6; // 스켈레톤 2줄
      }
    }
    invoke("set_floating_height", { height }).catch(() => {});
  }, [showDropdown, matches.length]);

  // window.focus 이벤트: document가 이미 focused 상태이므로 딜레이 없이 바로 input.focus()
  useEffect(() => {
    const onFocus = () => { inputRef.current?.focus(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // floating-shown → ESC 글로벌 단축키 등록 + input 포커스 + 데이터 로드
  // floating-should-hide → ESC 해제 + 창 닫기
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let unlistenShown: (() => void) | undefined;
    let escRegistered = false;

    const registerEsc = async () => {
      if (escRegistered) return;
      const ok = await registerHotkey("Escape", async () => {
        await unregisterHotkey("Escape");
        escRegistered = false;
        await hideFloatingWindow(true);
      });
      if (ok) escRegistered = true;
    };

    const unregisterEsc = async () => {
      if (!escRegistered) return;
      await unregisterHotkey("Escape");
      escRegistered = false;
    };

    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlistenShown = await listen("floating-shown", () => {
        registerEsc();
        reset();          // 입력/선택 초기화
        loadMatchData();  // 자동완성 데이터 갱신
      });
      unlisten = await listen("floating-should-hide", async () => {
        await unregisterEsc();
        await hideFloatingWindow();
      });
    })();

    return () => {
      unlisten?.();
      unlistenShown?.();
      unregisterEsc();
    };
  }, [reset, loadMatchData]);

  const handleSubmit = useCallback((e: { preventDefault(): void }) => {
    e.preventDefault();
    void submit();
  }, [submit]);

  return (
    <div className={styles.root}>
      <div className={styles.wrapper}>
        <form className={styles.form} onSubmit={handleSubmit}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 정적 export + 로컬 번들 아이콘이라 next/image 최적화 이득 없음 */}
          <img src="/icon-source.png" className={styles.appIcon} alt="" draggable={false} />
          {lockedTarget && (
            <span className={styles.lockChip} title={lockedTarget.title}>
              <span className={styles.lockChipLabel}>{lockedTarget.title}</span>
              <button type="button" className={styles.lockChipClear} onClick={clearLock} aria-label="대상 해제">✕</button>
            </span>
          )}
          <input
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={lockedTarget
              ? "명령 입력 (예: 삭제, 오후 7시로 변경)"
              : "일정 입력 (예: 내일 3시 팀 미팅) · 기존 일정 입력 시 수정/삭제"}
            disabled={status === "loading"}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {status === "loading" && <span className={styles.spinning}>⏳</span>}
          {status === "done"    && <span className={`${styles.indicator} ${styles.done}`}>✓ 완료</span>}
          {status === "error"   && <span className={`${styles.indicator} ${styles.error}`}>✗ 실패</span>}
        </form>
      </div>

      {showDropdown && (
        <ul className={styles.dropdown}>
          {loading && matches.length === 0 ? (
            [0, 1].map((i) => (
              <li key={`sk-${i}`} className={styles.skeletonRow}>
                <span className={`${styles.skeletonBar} ${styles.skeletonTitle}`}/>
                <span className={`${styles.skeletonBar} ${styles.skeletonMeta}`}/>
              </li>
            ))
          ) : (
            <li className={styles.hint}>↑↓로 대상 지정 후 명령 입력 · 지정 없이 Enter는 새 일정</li>
          )}
          {matches.map((ev, i) => (
            <li
              key={ev.id}
              className={`${styles.item} ${i === activeIndex ? styles.itemActive : ""}`}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => { e.preventDefault(); lockTarget(ev); }}
            >
              <span className={styles.itemTitle}>{ev.title}</span>
              <span className={styles.itemMeta}>{eventShortLabel(ev)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
