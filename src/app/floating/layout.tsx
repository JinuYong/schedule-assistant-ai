import styles from "./floating.module.css";

export default function FloatingLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.root}>{children}</div>;
}
