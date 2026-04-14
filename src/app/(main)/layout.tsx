import styles from "./layout.module.css";
import Sidebar from "@/components/Sidebar/Sidebar";
import Toaster from "@/components/Toast/Toast";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.container}>
      <Sidebar />
      <main className={styles.main}>{children}</main>
      <Toaster />
    </div>
  );
}
