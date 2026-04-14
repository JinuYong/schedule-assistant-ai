"use client";

import { useToastStore } from "@/store/toast";
import styles from "./Toast.module.css";

export default function Toaster() {
  const { toasts, dismiss } = useToastStore();
  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <div key={toast.id} className={`${styles.toast} ${styles[toast.type]}`}>
          <span className={styles.message}>{toast.message}</span>
          <button className={styles.close} onClick={() => dismiss(toast.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}
