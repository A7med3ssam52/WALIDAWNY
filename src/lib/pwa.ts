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

/** Register the service worker — production builds only. */
export function registerServiceWorker(): void {
  if (
    !import.meta.env.PROD ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error('Failed to register service worker:', error);
    });
  });
}
