"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useThemeStore, THEME_COLORS } from "@/store/theme";
import { storeGet, storeSet, isTauri } from "@/lib/tauri-store";
import { startGoogleOAuth, startMicrosoftOAuth } from "@/lib/oauth";
import { useOAuthConnection } from "@/hooks/use-oauth-connection";
import { DEFAULT_SHORTCUT } from "@/lib/hotkey";
import { fireNotification } from "@/lib/notifications";
import styles from "./page.module.css";

export default function SettingsContent() {
  const { googleTokens, setGoogleTokens, microsoftTokens, setMicrosoftTokens } = useAuthStore();
  const { accentColor, setTheme } = useThemeStore();

  const [anthropicKey, setAnthropicKey] = useState("");
  const [shortcut, setShortcut] = useState(DEFAULT_SHORTCUT);
  const [isRecording, setIsRecording] = useState(false);
  const [shortcutError, setShortcutError] = useState("");
  const isRecordingRef = useRef(false);

  const [mounted, setMounted] = useState(false);
  const [savedKeys, setSavedKeys] = useState(false);
  const [shortcutSaved, setShortcutSaved] = useState(false);
  const [notifStatus, setNotifStatus] = useState("");

  const testNotification = async () => {
    if (!isTauri()) { setNotifStatus("데스크탑 앱에서만 동작합니다."); return; }
    try {
      await fireNotification("Cali 알림 테스트", "이 알림이 보이면 정상입니다 ✅");
      setNotifStatus("알림을 보냈습니다. 배너 또는 우측 상단 알림 센터를 확인하세요. (앱이 맨 앞이면 배너 대신 알림 센터로 갑니다)");
    } catch (e) {
      setNotifStatus(`실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const google = useOAuthConnection(startGoogleOAuth, setGoogleTokens);
  const microsoft = useOAuthConnection(startMicrosoftOAuth, setMicrosoftTokens);

  useEffect(() => {
    setMounted(true);
    (async () => {
      setAnthropicKey((await storeGet<string>("anthropic.apiKey")) ?? "");
      setShortcut((await storeGet<string>("hotkey")) ?? DEFAULT_SHORTCUT);
    })();
  }, []);

  const saveKeys = async () => {
    await storeSet("anthropic.apiKey", anthropicKey);
    setSavedKeys(true);
    setTimeout(() => setSavedKeys(false), 2000);
  };

  useEffect(() => {
    const handleNativeKeyDown = (e: KeyboardEvent) => {
      if (!isRecordingRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      const ignoredKeys = ["Meta", "Control", "Alt", "Shift"];
      if (ignoredKeys.includes(e.key)) return;

      const modifiers: string[] = [];
      if (e.metaKey) modifiers.push("Command");
      if (e.ctrlKey) modifiers.push("Control");
      if (e.altKey) modifiers.push("Option");
      if (e.shiftKey) modifiers.push("Shift");
      if (modifiers.length === 0) return;

      let key = e.code;
      if (key.startsWith("Key")) key = key.slice(3);
      else if (key.startsWith("Digit")) key = key.slice(5);

      setShortcut([...modifiers, key].join("+"));
      isRecordingRef.current = false;
      setIsRecording(false);
    };

    window.addEventListener("keydown", handleNativeKeyDown, true);
    return () => window.removeEventListener("keydown", handleNativeKeyDown, true);
  }, []);

  const saveShortcut = async () => {
    setShortcutError("");
    try {
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        const prev = (await storeGet<string>("hotkey")) ?? DEFAULT_SHORTCUT;
        // Rust 레벨에서 단축키 교체 → HMR 재로드 후에도 유지됨
        await invoke("set_global_shortcut", { old: prev, new: shortcut });
      }
      await storeSet("hotkey", shortcut);
      setShortcutSaved(true);
      setTimeout(() => setShortcutSaved(false), 2000);
    } catch {
      setShortcutError("단축키 등록에 실패했습니다. 다른 키 조합을 시도해보세요.");
    }
  };

  return (
    <>
      {/* 테마 색상 */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>테마 색상</h2>
        </div>
        <p className={styles.description}>앱의 메인 색상을 선택합니다.</p>
        <div className={styles.themeSwatches}>
          {THEME_COLORS.map((t) => (
            <button
              key={t.color}
              className={`${styles.swatch} ${accentColor === t.color ? styles.swatchActive : ""}`}
              style={{ background: t.color }}
              onClick={() => setTheme(t.color, t.hover)}
              title={t.label}
            >
              {accentColor === t.color && <span className={styles.swatchCheck}>✓</span>}
            </button>
          ))}
        </div>
      </section>

      {/* API 키 */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>API 키 설정</h2>
        </div>
        <p className={styles.description}>
          앱 사용에 필요한 API 키를 입력합니다. 암호화되어 로컬에 저장됩니다.
        </p>
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Anthropic API Key</label>
          <input
            className={styles.shortcutInput}
            type="password"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-..."
          />
        </div>
        <button className={styles.saveBtn} onClick={saveKeys} style={{ marginTop: 12 }}>
          {savedKeys ? "저장됨 ✓" : "저장"}
        </button>
        {mounted && !isTauri() && (
          <p className={styles.hint}>※ Tauri 앱 환경에서만 저장됩니다.</p>
        )}
      </section>

      {/* Google Calendar */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Google Calendar</h2>
          {googleTokens && <span className={styles.badge}>연결됨</span>}
        </div>
        <p className={styles.description}>
          Google 계정으로 로그인하여 일정을 동기화합니다.
        </p>
        {google.error && <p className={styles.errorText}>{google.error}</p>}
        {googleTokens ? (
          <button className={styles.dangerBtn} onClick={() => setGoogleTokens(null)}>
            연결 해제
          </button>
        ) : (
          <button
            className={styles.connectBtn}
            onClick={google.connect}
            disabled={google.status === "waiting"}
          >
            {google.status === "waiting" ? "브라우저에서 인증 중..." : "Google로 로그인"}
          </button>
        )}
      </section>

      {/* Microsoft Todo */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Microsoft Todo</h2>
          {microsoftTokens && <span className={microsoftTokens.access_token ? styles.badge : styles.badgeWarn}>{ microsoftTokens.access_token ? "연결됨" : "토큰 오류 (재연결 필요)" }</span>}
        </div>
        <p className={styles.description}>
          Microsoft 계정으로 로그인하여 할일을 동기화합니다.
        </p>
        {microsoft.error && <p className={styles.errorText}>{microsoft.error}</p>}
        {microsoftTokens ? (
          <button className={styles.dangerBtn} onClick={() => setMicrosoftTokens(null)}>
            연결 해제
          </button>
        ) : (
          <button
            className={styles.connectBtn}
            onClick={microsoft.connect}
            disabled={microsoft.status === "waiting"}
          >
            {microsoft.status === "waiting" ? "브라우저에서 인증 중..." : "Microsoft로 로그인"}
          </button>
        )}
      </section>

      {/* 단축키 */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>플로팅 창 단축키</h2>
        </div>
        <p className={styles.description}>플로팅 입력창을 열기 위한 전역 단축키를 설정합니다.</p>
        <div className={styles.shortcutRow}>
          <input
            className={`${styles.shortcutInput}${isRecording ? ` ${styles.shortcutRecording}` : ""}`}
            value={isRecording ? "단축키를 입력하세요..." : shortcut}
            readOnly
            onFocus={() => { setIsRecording(true); isRecordingRef.current = true; }}
            onBlur={() => { setIsRecording(false); isRecordingRef.current = false; }}
            placeholder="클릭 후 단축키 입력"
          />
          <button className={styles.saveBtn} onClick={saveShortcut}>
            {shortcutSaved ? "저장됨 ✓" : "저장"}
          </button>
        </div>
        {shortcutError && <p className={styles.errorText}>{shortcutError}</p>}
        <p className={styles.hint}>입력창 클릭 후 원하는 키 조합을 누르세요. 변경 시 앱을 재시작해야 적용됩니다.</p>
      </section>

      {/* 알림 테스트 */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>알림</h2>
        </div>
        <p className={styles.description}>할일 알림(데스크탑)이 정상 동작하는지 즉시 테스트합니다.</p>
        <button className={styles.saveBtn} onClick={testNotification}>테스트 알림 보내기</button>
        {notifStatus && <p className={styles.hint}>{notifStatus}</p>}
      </section>
    </>
  );
}