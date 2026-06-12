import styles from "./icons.module.css";

export function IconChevronLeft() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 1L1 7l6 6"/>
    </svg>
  );
}

export function IconChevronRight() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 1l6 6-6 6"/>
    </svg>
  );
}

export function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6"/>
      <path d="M21 13a9 9 0 1 1-3-7.7L21 8"/>
    </svg>
  );
}

export function IconPlus({size = 10}: {size?: number} = {}) {
  const half = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round">
      <path d={`M${half} 1v${size - 2}M1 ${half}h${size - 2}`}/>
    </svg>
  );
}

export function IconPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 1.5l2 2L4 11H2V9l7.5-7.5z"/>
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6"/>
      <path d="M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  );
}

export function IconStar({filled}: {filled: boolean}) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round"
         strokeLinejoin="round" fill={filled ? "currentColor" : "none"} stroke="currentColor"
         className={filled ? styles.iconStarFilled : styles.iconStar}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  );
}

export function IconRepeat() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className={styles.iconRepeat}>
      <path d="M17 1l4 4-4 4"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <path d="M7 23l-4-4 4-4"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  );
}

export function IconChevron({open}: {open: boolean}) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round"
         className={`${styles.chevron}${open ? ` ${styles.chevronOpen}` : ""}`}>
      <path d="M2 4l4 4 4-4"/>
    </svg>
  );
}

export function IconClose() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round">
      <path d="M1 1l9 9M10 1L1 10"/>
    </svg>
  );
}
