import Link from 'next/link'
import styles from './unavailable-content.module.css'

export default function UnavailableContent({type} : {type: "GOOGLE" | "MICROSOFT"}) {
  const contents = type === "GOOGLE" ? {iconTitle: "G", title: "Google Calendar", text: "Google"} : {iconTitle: "M", title: "Microsoft Todo", text: "Microsoft"}
  return (
    <section className={styles.unavailable}>
      <div className={styles.unavailableContent}>
        <div className={styles.unavailableIcon} aria-hidden="true">{contents.iconTitle}</div>
        <div className={styles.unavailableCopy}>
          <p className={styles.unavailableTitle}>{contents.title} 연결이 필요합니다.</p>
          <p className={styles.unavailableText}>할일을 보려면 설정에서 {contents.text} 계정을 다시 연결해주세요.</p>
        </div>
        <Link href="/settings" className={styles.linkBtn}>설정으로 이동</Link>
      </div>
    </section>
  )
}