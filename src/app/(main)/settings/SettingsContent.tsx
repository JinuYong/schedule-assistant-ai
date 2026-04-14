"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useThemeStore, THEME_COLORS } from "@/store/theme";
import { storeGet, storeSet, isTauri } from "@/lib/tauri-store";
import { startGoogleOAuth, startMicrosoftOAuth } from "@/lib/oauth";
import { DEFAULT_SHORTCUT } from "@/lib/hotkey";
import styles from "./page.module.css";

export default function SettingsContent() {
  const { googleTokens, setGoogleTokens, microsoftTokens, setMicrosoftTokens } = useAuthStore();
  const { accentColor, setTheme } = useThemeStore();

  const [anthropicKey, setAnthropicKey] = useState("");
  const [microsoftClientId, setMicrosoftClientId] = useState("");
  const [microsoftClientSecret, setMicrosoftClientSecret] = useState("");
  const [shortcut, setShortcut] = useState(DEFAULT_SHORTCUT);

  const [mounted, setMounted] = useState(false);
  const [savedKeys, setSavedKeys] = useState(false);
  const [shortcutSaved, setShortcutSaved] = useState(false);
  const [googleOAuthStatus, setGoogleOAuthStatus] = useState<"idle" | "waiting" | "error">("idle");
  const [googleOAuthError, setGoogleOAuthError] = useState("");
  const [msOAuthStatus, setMsOAuthStatus] = useState<"idle" | "waiting" | "error">("idle");
  const [msOAuthError, setMsOAuthError] = useState("");

  useEffect(() => {
    setMounted(true);
    (async () => {
      setAnthropicKey((await storeGet<string>("anthropic.apiKey")) ?? "");
      setMicrosoftClientId((await storeGet<string>("microsoft.clientId")) ?? "");
      setMicrosoftClientSecret((await storeGet<string>("microsoft.clientSecret")) ?? "");
      setShortcut((await storeGet<string>("hotkey")) ?? DEFAULT_SHORTCUT);
    })();
  }, []);

  const saveKeys = async () => {
    await storeSet("anthropic.apiKey", anthropicKey);
    await storeSet("microsoft.clientId", microsoftClientId);
    await storeSet("microsoft.clientSecret", microsoftClientSecret);
    setSavedKeys(true);
    setTimeout(() => setSavedKeys(false), 2000);
  };

  const connectGoogle = async () => {
    setGoogleOAuthStatus("waiting");
    setGoogleOAuthError("");
    await startGoogleOAuth(
      (tokens) => {
        setGoogleTokens({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
        });
        setGoogleOAuthStatus("idle");
      },
      (err) => {
        setGoogleOAuthError(err);
        setGoogleOAuthStatus("error");
      }
    );
  };

  const connectMicrosoft = async () => {
    setMsOAuthStatus("waiting");
    setMsOAuthError("");
    await startMicrosoftOAuth(
      (tokens) => {
        setMicrosoftTokens({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
        });
        setMsOAuthStatus("idle");
      },
      (err) => {
        setMsOAuthError(err);
        setMsOAuthStatus("error");
      }
    );
  };

  const saveShortcut = async () => {
    await storeSet("hotkey", shortcut);
    setShortcutSaved(true);
    setTimeout(() => setShortcutSaved(false), 2000);
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
          <label className={styles.label} style={{ marginTop: 12 }}>Microsoft Client ID</label>
          <input
            className={styles.shortcutInput}
            type="password"
            value={microsoftClientId}
            onChange={(e) => setMicrosoftClientId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
          <label className={styles.label}>Microsoft Client Secret</label>
          <input
            className={styles.shortcutInput}
            type="password"
            value={microsoftClientSecret}
            onChange={(e) => setMicrosoftClientSecret(e.target.value)}
            placeholder="Microsoft App Secret"
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
        {googleOAuthError && <p className={styles.errorText}>{googleOAuthError}</p>}
        {googleTokens ? (
          <button className={styles.dangerBtn} onClick={() => setGoogleTokens(null)}>
            연결 해제
          </button>
        ) : (
          <button
            className={styles.connectBtn}
            onClick={connectGoogle}
            disabled={googleOAuthStatus === "waiting"}
          >
            {googleOAuthStatus === "waiting" ? "브라우저에서 인증 중..." : "Google로 로그인"}
          </button>
        )}
      </section>

      {/* Microsoft Todo */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Microsoft Todo</h2>
          {microsoftTokens && <span className={styles.badge}>연결됨</span>}
        </div>
        <p className={styles.description}>
          Microsoft 계정을 연동하여 할일을 동기화합니다. (Client ID/Secret 먼저 저장 필요)
        </p>
        {msOAuthError && <p className={styles.errorText}>{msOAuthError}</p>}
        {microsoftTokens ? (
          <button className={styles.dangerBtn} onClick={() => setMicrosoftTokens(null)}>
            연결 해제
          </button>
        ) : (
          <button
            className={styles.connectBtn}
            onClick={connectMicrosoft}
            disabled={msOAuthStatus === "waiting"}
          >
            {msOAuthStatus === "waiting" ? "브라우저에서 인증 중..." : "Microsoft 계정 연결"}
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
            className={styles.shortcutInput}
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder="예: CommandOrControl+Shift+Space"
          />
          <button className={styles.saveBtn} onClick={saveShortcut}>
            {shortcutSaved ? "저장됨 ✓" : "저장"}
          </button>
        </div>
        <p className={styles.hint}>변경 시 앱을 재시작해야 적용됩니다.</p>
      </section>
    </>
  );
}
