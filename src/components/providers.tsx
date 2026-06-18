"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import ThemeApplier from "@/components/theme-applier";
import TauriInit from "@/components/tauri-init";

export default function Providers({ children }: { children: React.ReactNode }) {
  // lazy 초기화 — 컴포넌트 수명 동안 단일 QueryClient (render 중 ref 접근 회피)
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 1000 * 60 * 5 } } })
  );

  const loadFromStore = useAuthStore((s) => s.loadFromStore);

  useEffect(() => {
    loadFromStore();
  }, [loadFromStore]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeApplier />
      <TauriInit />
      {children}
    </QueryClientProvider>
  );
}
