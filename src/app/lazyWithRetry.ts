import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Chunk-load resilience.
 *
 * Every route chunk used to load through a bare `lazy(() => import(...))`:
 * one transient network hiccup while the platform opened rejected the import,
 * flashed the ErrorBoundary ("حدث خطأ غير متوقع"), and then recovered through
 * an automatic full-page reload. `lazyWithRetry` absorbs those transient
 * failures invisibly instead — the Suspense spinner simply keeps showing until
 * a retry succeeds. Only a genuinely permanent failure (e.g. a stale chunk
 * hash after a deploy) still reaches the ErrorBoundary, which keeps its
 * reload-as-last-resort behavior.
 *
 * It also coordinates with Vite's `vite:preloadError` event (see main.tsx):
 * a preload failure always accompanies the import attempt of the same chunk,
 * so an immediate reload there would preempt the retries below. The preload
 * handler therefore schedules a *delayed* reload that any finished chunk
 * import cancels on its way through.
 */

const IMPORT_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [400, 1200];
const PRELOAD_RECOVERY_RELOAD_DELAY_MS = 9_000;
const RELOAD_LOOP_GUARD_MS = 300_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Retries a dynamic import factory with backoff; rethrows the last error. */
export function retryImport<T>(
  factory: () => Promise<T>,
  retriesLeft: number = IMPORT_ATTEMPTS - 1,
  delaysMs: number[] = RETRY_DELAYS_MS,
): Promise<T> {
  return factory().catch((error: unknown) => {
    if (retriesLeft <= 0) {
      throw error;
    }
    const attemptIndex = IMPORT_ATTEMPTS - 1 - retriesLeft;
    const delay = delaysMs[Math.min(attemptIndex, delaysMs.length - 1)] ?? 0;
    return wait(delay).then(() => retryImport(factory, retriesLeft - 1, delaysMs));
  });
}

let recoveryTimer: ReturnType<typeof setTimeout> | undefined;

function reloadPage(): void {
  try {
    const key = 'chunk-reload-preload';
    const last = sessionStorage.getItem(key);
    if (!last || Date.now() - Number(last) > RELOAD_LOOP_GUARD_MS) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  } catch {
    window.location.reload();
  }
}

/**
 * Schedules a recovery reload after a preload failure, giving in-flight chunk
 * retries a chance to succeed first. Re-scheduling resets the timer.
 */
export function scheduleChunkRecoveryReload(
  delayMs: number = PRELOAD_RECOVERY_RELOAD_DELAY_MS,
): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (recoveryTimer !== undefined) {
    clearTimeout(recoveryTimer);
  }
  recoveryTimer = setTimeout(() => {
    recoveryTimer = undefined;
    reloadPage();
  }, delayMs);
}

/** Cancels a pending recovery reload — called when a chunk import settles. */
export function cancelChunkRecoveryReload(): void {
  if (recoveryTimer !== undefined) {
    clearTimeout(recoveryTimer);
    recoveryTimer = undefined;
  }
}

/** Drop-in replacement for `React.lazy` with transparent import retries. */
export function lazyWithRetry<T extends ComponentType<Record<string, never>>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() =>
    retryImport(factory).then(
      (module) => {
        cancelChunkRecoveryReload();
        return module;
      },
      (error: unknown) => {
        cancelChunkRecoveryReload();
        throw error;
      },
    ),
  );
}
