import { Suspense } from "react";
import SettingsContent from "./settings-content";
import styles from "./page.module.css";

export default function SettingsPage() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>설정</h1>
      <Suspense fallback={<p>로딩 중...</p>}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}
