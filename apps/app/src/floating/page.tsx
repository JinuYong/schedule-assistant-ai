import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import { isTauri, storeGet } from "@/lib/tauri-store";
import { invoke } from "@tauri-apps/api/core";
import { hideFloatingWindow, openMainWindow } from "@/lib/floating-window";
import { registerHotkey, unregisterHotkey } from "@/lib/hotkey";
import {
  getCalendarList,
  listEventsInRange,
  type CalendarListItem,
} from "@/lib/google-calendar";
import { useAuthStore } from "@/store/auth";
import { readStoredSession } from "@/store/account";
import { MOCK_ENABLED } from "@/lib/dev-mock";
import { CalendarEvent, mapGCalEvent } from "@/store/events";
import { useScheduleCommand } from "@/hooks/use-schedule-command";
import { eventShortLabel } from "@/lib/event-match";
import {
  answerMainConfirm,
  askMain,
  listenFloatingConfirm,
} from "@/lib/ai/bridge";
import type { AiConfirm } from "@/store/ai";
import styles from "./page.module.css";

const BASE_HEIGHT = 64;
/** 입력창 아래 로그인 안내 한 줄 높이(.notice) */
const NOTICE_HEIGHT = 44;
/** 일정을 바꾼 답은 이만큼 보여 주고 창을 닫는다 */
const HIDE_AFTER_MUTATION_MS = 1800;

export default function FloatingPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const refreshGoogle = useAuthStore((s) => s.refreshGoogle);
  const loadFromStore = useAuthStore((s) => s.loadFromStore);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  // 로그인 없이 실행하려 했을 때 입력창 아래에 안내를 띄운다. 이 상태에서 Enter → 로그인 화면
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [calendars, setCalendars] = useState<CalendarListItem[]>([]);
  // 메인 창(AI 세션)이 보낸 확인 요청. Esc 단축키 처리기가 읽으므로 ref에도 둔다
  const [confirm, setConfirm] = useState<AiConfirm | null>(null);
  const confirmRef = useRef<AiConfirm | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // 오류는 답 자리에 보여 준다(플로팅엔 토스트가 없다)
  const [error, setError] = useState("");

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
    result,
    clearResult,
  } = useScheduleCommand({
    events,
    calendars,
    getToken: useCallback(async () => {
      // 플로팅창은 메인 창과 별개 스토어라, 토큰이 비어 있으면 tauri-store에서 하이드레이트
      if (!useAuthStore.getState().googleTokens) await loadFromStore();
      return (await refreshGoogle())?.access_token ?? null;
    }, [refreshGoogle, loadFromStore]),
    ask: useCallback(
      (text: string, target?: CalendarEvent) => askMain(text, target),
      [],
    ),
    onError: setError,
  });

  useEffect(() => {
    confirmRef.current = confirm;
  }, [confirm]);

  useEffect(
    () =>
      listenFloatingConfirm((c) => {
        setConfirm(c);
      }),
    [],
  );

  const answer = useCallback((ok: boolean) => {
    const c = confirmRef.current;
    if (!c) return;
    answerMainConfirm(c.id, ok);
    confirmRef.current = null;
    setConfirm(null);
  }, []);

  // 확인 중엔 입력창이 잠겨 있으니 창 전체에서 Enter를 받는다(Esc는 전역 단축키 처리기에서)
  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        answer(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, answer]);

  // 일정을 바꿨으면 답을 잠깐 보여 주고 닫는다. 질문에 답했거나 되물었으면 그대로 둔다
  useEffect(() => {
    clearTimeout(hideTimer.current);
    if (result?.mutated && isTauri())
      hideTimer.current = setTimeout(() => {
        void hideFloatingWindow();
      }, HIDE_AFTER_MUTATION_MS);
    return () => clearTimeout(hideTimer.current);
  }, [result]);

  // 자동완성용 데이터: 캐시 즉시 반영 후 토큰 있으면 최신 이벤트로 갱신
  const loadMatchData = useCallback(async () => {
    await loadFromStore(); // 메인 창에서 로그인한 최신 토큰을 플로팅창 스토어로 반영
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
  }, [refreshGoogle, loadFromStore]);

  const dropdownVisible = showDropdown && !needsSignIn && !confirm;
  const showPanel =
    !needsSignIn &&
    !dropdownVisible &&
    (!!confirm ||
      !!error ||
      (!!result && (!!result.reply || result.actions.length > 0)));

  // 후보 드롭다운·로그인 안내·답 노출 시 창 높이 확장, 닫히면 원복 (Rust setFrame 경유)
  useLayoutEffect(() => {
    if (!isTauri()) return;
    let height = BASE_HEIGHT;
    if (needsSignIn) {
      height = 6 + 52 + 6 + NOTICE_HEIGHT + 6;
    } else if (dropdownVisible) {
      if (matches.length > 0) {
        const n = Math.min(matches.length, 5);
        height = 6 + 52 + 6 + (28 + n * 37) + 6;
      } else {
        height = 6 + 52 + 6 + 2 * 33 + 6; // 스켈레톤 2줄
      }
    } else if (showPanel && panelRef.current) {
      height = 6 + 52 + 6 + panelRef.current.offsetHeight + 6;
    }
    invoke("set_floating_height", { height }).catch(() => {});
  }, [
    dropdownVisible,
    matches.length,
    needsSignIn,
    showPanel,
    confirm,
    error,
    result,
  ]);

  // window.focus 이벤트: document가 이미 focused 상태이므로 딜레이 없이 바로 input.focus()
  useEffect(() => {
    const onFocus = () => {
      inputRef.current?.focus();
    };
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
        // 확인 중이면 Esc는 "취소" — 창은 그대로 둔다
        if (confirmRef.current) {
          answer(false);
          return;
        }
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
        reset(); // 입력/선택 초기화
        clearResult();
        setError("");
        setNeedsSignIn(false);
        loadMatchData(); // 자동완성 데이터 갱신
      });
      unlisten = await listen("floating-should-hide", async () => {
        // 확인을 기다리던 중에 창을 닫으면 취소로 본다
        answer(false);
        await unregisterEsc();
        await hideFloatingWindow();
      });
    })();

    return () => {
      unlisten?.();
      unlistenShown?.();
      unregisterEsc();
    };
  }, [reset, clearResult, loadMatchData, answer]);

  // 창은 로그인 없이도 열리지만 실행은 Cali 계정이 있어야 한다 → 없으면 입력창 아래에 안내,
  // 한 번 더 Enter(또는 버튼)면 메인 창(로그인 화면)으로. 바로 넘기면 창이 갑자기 사라져 보인다.
  // 로그인·로그아웃은 메인 창에서 일어나므로 실행할 때마다 저장소에서 다시 읽는다
  const handleSubmit = useCallback(
    async (e: { preventDefault(): void }) => {
      e.preventDefault();
      if (needsSignIn) {
        setNeedsSignIn(false);
        await openMainWindow();
        return;
      }
      if (isTauri() && !MOCK_ENABLED && !(await readStoredSession())) {
        setNeedsSignIn(true);
        return;
      }
      clearTimeout(hideTimer.current);
      setError("");
      void submit();
    },
    [submit, needsSignIn],
  );

  return (
    <div className={styles.root}>
      <div className={styles.wrapper}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <img
            src="/icon-source.png"
            className={styles.appIcon}
            alt=""
            draggable={false}
          />
          {lockedTarget && (
            <span className={styles.lockChip} title={lockedTarget.title}>
              <span className={styles.lockChipLabel}>{lockedTarget.title}</span>
              <button
                type="button"
                className={styles.lockChipClear}
                onClick={clearLock}
                aria-label="대상 해제"
              >
                ✕
              </button>
            </span>
          )}
          <input
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setNeedsSignIn(false);
              setError("");
              clearResult();
              clearTimeout(hideTimer.current);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              lockedTarget
                ? "이 일정에 할 일 (예: 삭제, 오후 7시로 옮겨줘)"
                : "AI에게 말하기 (예: 내일 3시 팀 미팅) · 기존 일정 이름을 치면 골라서 고치기"
            }
            disabled={status === "loading"}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {status === "loading" && !confirm && (
            <span className={styles.spinning}>⏳</span>
          )}
          {status === "done" && (
            <span className={`${styles.indicator} ${styles.done}`}>✓ 완료</span>
          )}
          {status === "error" && (
            <span className={`${styles.indicator} ${styles.error}`}>
              ✗ 실패
            </span>
          )}
        </form>
      </div>

      {needsSignIn && (
        <div className={styles.notice} role="alert">
          <span className={styles.noticeText}>
            로그인해야 일정을 추가할 수 있어요
          </span>
          <button
            type="button"
            className={styles.noticeButton}
            onMouseDown={(e) => e.preventDefault()} // 입력창 포커스 유지
            onClick={() => {
              setNeedsSignIn(false);
              void openMainWindow();
            }}
          >
            로그인 <kbd className={styles.kbd}>↵</kbd>
          </button>
        </div>
      )}

      {showPanel && (
        <div ref={panelRef} className={styles.panel}>
          {confirm ? (
            <>
              <p className={styles.panelText}>{confirm.text}</p>
              <div className={styles.panelButtons}>
                <button
                  type="button"
                  className={styles.panelCancel}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => answer(false)}
                >
                  취소 <kbd className={styles.kbd}>esc</kbd>
                </button>
                <button
                  type="button"
                  className={styles.noticeButton}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => answer(true)}
                >
                  확인 <kbd className={styles.kbd}>↵</kbd>
                </button>
              </div>
            </>
          ) : error ? (
            <p className={`${styles.panelText} ${styles.panelError}`}>
              {error}
            </p>
          ) : (
            result && (
              <>
                {result.reply && (
                  <p className={styles.panelText}>{result.reply}</p>
                )}
                {result.actions.map((a, i) => (
                  <p
                    key={i}
                    className={`${styles.panelAction} ${a.ok ? "" : styles.panelError}`}
                  >
                    {a.ok ? "✓" : "✗"} {a.text}
                  </p>
                ))}
              </>
            )
          )}
        </div>
      )}

      {dropdownVisible && (
        <ul className={styles.dropdown}>
          {loading && matches.length === 0 ? (
            [0, 1].map((i) => (
              <li key={`sk-${i}`} className={styles.skeletonRow}>
                <span
                  className={`${styles.skeletonBar} ${styles.skeletonTitle}`}
                />
                <span
                  className={`${styles.skeletonBar} ${styles.skeletonMeta}`}
                />
              </li>
            ))
          ) : (
            <li className={styles.hint}>
              ↑↓로 일정을 고른 뒤 할 일 입력 · 고르지 않고 Enter는 그대로 AI에게
            </li>
          )}
          {matches.map((ev, i) => (
            <li
              key={ev.id}
              className={`${styles.item} ${i === activeIndex ? styles.itemActive : ""}`}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                lockTarget(ev);
              }}
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
