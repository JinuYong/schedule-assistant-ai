import { Link } from "@tanstack/react-router";
import styles from "./unavailable-content.module.css";

/** Google 캘린더 연결이 없을 때 일정 화면 대신 보여 주는 안내 */
export default function UnavailableContent() {
  return (
    <section className={styles.unavailable}>
      <div className={styles.unavailableContent}>
        <div className={styles.unavailableIcon} aria-hidden="true">
          G
        </div>
        <div className={styles.unavailableCopy}>
          <p className={styles.unavailableTitle}>
            Google Calendar 연결이 필요합니다.
          </p>
          <p className={styles.unavailableText}>
            일정을 보려면 설정에서 Google 계정을 다시 연결해주세요.
          </p>
        </div>
        <Link to="/settings" className={styles.linkBtn}>
          설정으로 이동
        </Link>
      </div>
    </section>
  );
}
