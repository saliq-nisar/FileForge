import { useSyncExternalStore } from "react";

/**
 * Safe localStorage JSON helpers: private mode, quota errors and corrupt data
 * never throw into the UI. Writes bump a version so components can subscribe
 * (useStorageVersion) instead of re-reading storage in effects.
 */
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version++;
  listeners.forEach((l) => l());
}

export function readJson<T>(key: string, fallback: T, storage: "local" | "session" = "local"): T {
  try {
    const s = storage === "local" ? localStorage : sessionStorage;
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown, storage: "local" | "session" = "local"): boolean {
  try {
    const s = storage === "local" ? localStorage : sessionStorage;
    s.setItem(key, JSON.stringify(value));
    notify();
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string, storage: "local" | "session" = "local"): void {
  try {
    (storage === "local" ? localStorage : sessionStorage).removeItem(key);
    notify();
  } catch {
    /* ignore */
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // Changes made in other tabs.
  const onStorage = () => notify();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Storage version for render-time reads: null during SSR/hydration (browser
 * storage isn't available there), then a number that changes on every write.
 * Usage: `const v = useStorageVersion(); const items = useMemo(() => v === null ? null : repo.list(), [v]);`
 */
export function useStorageVersion(): number | null {
  return useSyncExternalStore(subscribe, () => version, () => null);
}
