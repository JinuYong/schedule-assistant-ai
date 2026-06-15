import styles from "./layout.module.css";
import Sidebar from "@/components/sidebar";
import Toaster from "@/components/toast";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.container}>
      <Sidebar />
      <main className={styles.main}>{children}</main>
      <Toaster />
    </div>
  );
}
