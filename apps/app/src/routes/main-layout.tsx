import { Outlet } from "@tanstack/react-router";
import styles from "./main-layout.module.css";
import Sidebar from "@/components/sidebar";
import Toaster from "@/components/toast";
import AiConfirmDialog from "@/components/ai-confirm-dialog";
import { useAiRunner } from "@/hooks/use-ai-runner";

export default function MainLayout() {
  // AI 세션은 메인 창에서 돈다(플로팅 창도 여기에 부탁한다)
  useAiRunner();
  return (
    <div className={styles.container}>
      <Sidebar />
      <main className={styles.main}>
        <Outlet />
      </main>
      <Toaster />
      <AiConfirmDialog />
    </div>
  );
}
