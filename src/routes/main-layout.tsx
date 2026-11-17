import { Outlet } from "@tanstack/react-router";
import styles from "./main-layout.module.css";
import Sidebar from "@/components/sidebar";
import Toaster from "@/components/toast";

export default function MainLayout() {
  return (
    <div className={styles.container}>
      <Sidebar />
      <main className={styles.main}>
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
