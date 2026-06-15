"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth";
import ThemeApplier from "@/components/theme-applier";
import TauriInit from "@/components/tauri-init";

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClientRef = useRef<QueryClient | null>(null);
  if (!queryClientRef.current) {
    queryClientRef.current = new QueryClient({
      defaultOptions: { queries: { staleTime: 1000 * 60 * 5 } },
    });
  }

  const loadFromStore = useAuthStore((s) => s.loadFromStore);

  useEffect(() => {
    loadFromStore();
  }, [loadFromStore]);

  return (
    <QueryClientProvider client={queryClientRef.current}>
      <ThemeApplier />
      <TauriInit />
      {children}
    </QueryClientProvider>
  );
}
