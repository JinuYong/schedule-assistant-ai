import { LazyStore } from "@tauri-apps/plugin-store";

let _store: LazyStore | null = null;

function getStore(): LazyStore {
  if (!_store) {
    _store = new LazyStore("app-store.json");
  }
  return _store;
}

function _isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export async function storeGet<T>(key: string): Promise<T | null> {
  if (!_isTauri()) return null;
  const store = getStore();
  const value = await store.get<T>(key);
  return value ?? null;
}

export async function storeSet(key: string, value: unknown): Promise<void> {
  if (!_isTauri()) return;
  const store = getStore();
  await store.set(key, value);
}

export async function storeDelete(key: string): Promise<void> {
  if (!_isTauri()) return;
  const store = getStore();
  await store.delete(key);
}

export function isTauri(): boolean {
  return _isTauri();
}
