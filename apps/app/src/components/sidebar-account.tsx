import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAccountStore } from "@/store/account";
import styles from "./sidebar-account.module.css";

/**
 * 사이드바 아래 계정 영역. SignInGate 안쪽이라 항상 로그인돼 있다(로그인 버튼은 로그인 화면에만).
 * 사진·이름·이메일 + ⋯ 메뉴(설정, 로그아웃). 아이콘 전용 모드에선 사진만 보이고 사진을 눌러 메뉴를 연다.
 */
export default function SidebarAccount({ iconOnly }: { iconOnly: boolean }) {
  const user = useAccountStore((s) => s.session?.user);
  const signOut = useAccountStore((s) => s.signOut);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭·ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;
  const displayName = user.name || user.email;

  const logOut = () => {
    setOpen(false);
    void signOut();
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.account} ${iconOnly ? styles.iconOnly : ""}`}
    >
      {open && (
        <div className={styles.menu} role="menu">
          {iconOnly && (
            <div className={styles.menuHeader}>
              <span className={styles.name}>{displayName}</span>
              {user.name && <span className={styles.email}>{user.email}</span>}
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              setOpen(false);
              void navigate({ to: "/settings" });
            }}
          >
            설정
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${styles.menuItem} ${styles.danger}`}
            onClick={logOut}
          >
            로그아웃
          </button>
        </div>
      )}

      {iconOnly ? (
        <button
          type="button"
          className={styles.avatarButton}
          onClick={() => setOpen((v) => !v)}
          aria-label="계정 메뉴"
          aria-expanded={open}
          title={user.email}
        >
          <Avatar url={user.pictureUrl} name={displayName} />
        </button>
      ) : (
        <>
          <Avatar url={user.pictureUrl} name={displayName} />
          <div className={styles.info}>
            <span className={styles.name}>{displayName}</span>
            {user.name && <span className={styles.email}>{user.email}</span>}
          </div>
          <button
            type="button"
            className={styles.moreButton}
            onClick={() => setOpen((v) => !v)}
            aria-label="계정 메뉴"
            aria-expanded={open}
          >
            ⋯
          </button>
        </>
      )}
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed)
    return (
      <img
        className={styles.avatar}
        src={url}
        alt=""
        // Google 프로필 사진은 Referer가 붙으면 403이 날 때가 있다
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  return (
    <span className={`${styles.avatar} ${styles.initial}`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
