/**
 * PWA helpers — install prompt plumbing + service worker registration.
 * Keeps browser-install logic out of the UI so the custom prompt owns the UX.
 */

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWA_STORAGE_KEYS = {
  installed: 'walid-pwa-installed',
  dismissed: 'walid-pwa-dismissed-at',
} as const;

/** Re-show the custom prompt after this long since the last dismissal. */
export const PWA_REPROMPT_DAYS = 30;
const REPROMPT_MS = PWA_REPROMPT_DAYS * 24 * 60 * 60 * 1000;

export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if ('standalone' in navigator && navigator.standalone === true) {
    return true;
  }
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(display-mode: standalone)').matches;
  }
  return false;
}

/** iOS Safari has no beforeinstallprompt — it needs the manual "Add to Home Screen" guide. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isPWAInstalled(): boolean {
  try {
    return localStorage.getItem(PWA_STORAGE_KEYS.installed) === '1';
  } catch {
    return false;
  }
}

export function markPWAInstalled(): void {
  try {
    localStorage.setItem(PWA_STORAGE_KEYS.installed, '1');
  } catch {
    // storage unavailable (private mode) — ignore
  }
}

export function isPromptDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(PWA_STORAGE_KEYS.dismissed) ?? '0');
    return Number.isFinite(at) && at > 0 && Date.now() - at < REPROMPT_MS;
  } catch {
    return false;
  }
}

export function dismissPrompt(): void {
  try {
    localStorage.setItem(PWA_STORAGE_KEYS.dismissed, String(Date.now()));
  } catch {
    // storage unavailable (private mode) — ignore
  }
}

/** Register the service worker — production builds only. Forces v2 icon update. */
export function registerServiceWorker(): void {
  if (
    !import.meta.env.PROD ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js?v=2')
      .then((reg) => {
        // Check for update immediately and on visibility change — forces v2 for already-installed clients
        const checkUpdate = () => {
          reg.update().catch(() => {});
        };
        // Listen for new SW taking over — reload to show new icons without manual reinstall
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New v2 is ready — skipWaiting already called in sw.js, controllerchange will reload
            }
          });
        });
        // Periodic update check + on visibility return
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkUpdate();
        });
        // Also force a check 2s after load to catch v1 -> v2 quickly
        setTimeout(checkUpdate, 2000);
      })
      .catch((error: unknown) => {
        console.error('Failed to register service worker:', error);
      });
  });
}

/**
 * Force PWA update check — call on app start to ensure v2 icons propagate
 * even if the user never closes the tab. Safe to call multiple times.
 */
export function forcePWAUpdate(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistration().then((reg) => {
    reg?.update().catch(() => {});
  });
}
