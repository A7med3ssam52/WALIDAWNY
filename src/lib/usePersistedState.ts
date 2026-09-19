import { useEffect, useState } from 'react';

/** Read a JSON value from localStorage (null when missing/corrupt/unavailable). */
export function readPersisted<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null || raw === '') return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Write a JSON value to localStorage (best-effort: quota/private-mode safe). */
export function writePersisted(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // non-fatal: the form simply won't survive a refresh
  }
}

/** Remove a persisted value (best-effort). */
export function clearPersisted(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

interface PersistedOptions {
  /** When true, state changes are NOT written (e.g. a modal borrowed the same fields). */
  paused?: boolean;
}

/**
 * useState mirrored to localStorage: the initial value is restored from
 * storage when present, and every change is saved automatically.
 * Used for unsent staff drafts (exam/question forms) so a refresh or an
 * accidental navigation never loses typed input. File inputs are NOT
 * persistable and must stay outside this hook.
 */
export function usePersistedState<T>(
  key: string,
  initial: T | (() => T),
  options?: PersistedOptions,
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const [value, setValue] = useState<T>(() => {
    const saved = readPersisted<T>(key);
    if (saved !== null) return saved;
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });

  const paused = options?.paused ?? false;
  useEffect(() => {
    if (paused) return;
    writePersisted(key, value);
  }, [key, value, paused]);

  const clear = () => clearPersisted(key);
  return [value, setValue, clear];
}
