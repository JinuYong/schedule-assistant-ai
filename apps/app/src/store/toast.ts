import { create } from "zustand";

export type ToastType = "error" | "success" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastStore {
  toasts: Toast[];
  show: (message: string, type?: ToastType) => void;
  dismiss: (id: string) => void;
}

let _id = 0;
const AUTO_DISMISS_MS = 5000;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  show: (message, type = "error") => {
    const id = String(++_id);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, AUTO_DISMISS_MS);
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** React 컴포넌트 밖(store, lib 등)에서도 토스트 표시 */
export function showToast(message: string, type: ToastType = "error") {
  useToastStore.getState().show(message, type);
}
