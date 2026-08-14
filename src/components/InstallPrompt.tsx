import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Gauge, Home, MousePointerClick, Plus, Share, Smartphone, X } from 'lucide-react';

import {
  dismissPrompt,
  isIOS,
  isPromptDismissed,
  isPWAInstalled,
  isRunningStandalone,
  markPWAInstalled,
  type BeforeInstallPromptEvent,
} from '../lib/pwa';
import { Button } from './Button';

type PromptMode = 'install' | 'ios';

const installFeatures = [
  { icon: MousePointerClick, label: 'افتح بضغطة واحدة' },
  { icon: Gauge, label: 'أداء أسرع' },
  { icon: Smartphone, label: 'تجربة تطبيق حقيقية' },
];

const iosSteps = [
  { icon: Share, label: 'اضغط زر المشاركة في المتصفح' },
  { icon: Plus, label: 'اختر «إضافة إلى الشاشة الرئيسية»' },
  { icon: Home, label: 'افتح منصة مستر وليد من شاشتك الرئيسية' },
];

const iOS_DEBOUNCE_MS = 1800;

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function InstallPrompt() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PromptMode>('install');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'pwa-install-title';

  const maybeOpen = useCallback((nextMode: PromptMode) => {
    if (isPWAInstalled() || isPromptDismissed() || isRunningStandalone()) {
      return;
    }
    setMode(nextMode);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      maybeOpen('install');
    };
    const onInstalled = () => {
      markPWAInstalled();
      setDeferred(null);
      setOpen(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [maybeOpen]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mql = window.matchMedia('(display-mode: standalone)');
    if (mql.matches) {
      markPWAInstalled();
      setOpen(false);
      return undefined;
    }
    const onChange = () => {
      if (mql.matches) {
        markPWAInstalled();
        setOpen(false);
      }
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!isIOS()) {
      return undefined;
    }
    const timer = window.setTimeout(() => maybeOpen('ios'), iOS_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [maybeOpen]);

  const handleInstall = useCallback(async () => {
    const installEvent = deferred;
    if (!installEvent) {
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') {
      markPWAInstalled();
      setDeferred(null);
      setOpen(false);
    } else {
      handleDismiss();
    }
  }, [deferred]);

  const handleDismiss = useCallback(() => {
    dismissPrompt();
    setDeferred(null);
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable?.[0] ?? dialog)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleDismiss();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleDismiss]);

  if (!open) {
    return null;
  }

  const isIosMode = mode === 'ios';

  return (
    <div
      className="glass-overlay fixed inset-0 z-[150] flex items-end justify-center p-0 sm:items-center sm:p-4 animate-fade-in"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleDismiss();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="glass-panel relative w-full max-w-md rounded-t-2xl px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-5 sm:rounded-2xl sm:p-6 animate-scale-in"
      >
        <button
          type="button"
          aria-label="إغلاق"
          onClick={handleDismiss}
          className="absolute end-3 top-3 rounded-lg p-2 text-foreground-subtle transition-colors hover:bg-white/6 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-4">
          <img
            src="/icons/icon-192.png"
            alt=""
            className="h-16 w-16 shrink-0 rounded-2xl ring-1 ring-white/15 shadow-[0_0_30px_-6px_rgba(129,140,248,0.85)]"
          />
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-2.5 py-0.5 text-[0.65rem] font-bold text-primary">
              <Smartphone aria-hidden="true" className="h-3 w-3" />
              تطبيق منصة مستر وليد
            </span>
            <h2 id={titleId} className="mt-1.5 text-lg font-extrabold leading-snug text-foreground">
              {isIosMode
                ? 'أضف منصة مستر وليد إلى شاشتك الرئيسية'
                : 'ثبّت تطبيق منصة مستر وليد على موبايلك'}
            </h2>
          </div>
        </div>

        {isIosMode ? (
          <ol className="mt-5 space-y-2.5">
            {iosSteps.map(({ icon: Icon, label }, index) => (
              <li
                key={label}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-foreground"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 text-white shadow-[0_6px_16px_-6px_rgba(124,58,237,0.8)]">
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="flex-1 leading-relaxed">{label}</span>
                <span className="text-xs font-bold text-foreground-subtle">{index + 1}</span>
              </li>
            ))}
          </ol>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-foreground-muted">
              افتح المنصة بضغطة واحدة من شاشتك الرئيسية — أسرع وأسهل بدون فتح المتصفح في كل مرة.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {installFeatures.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2 py-3 text-center"
                >
                  <Icon aria-hidden="true" className="h-4 w-4 text-primary" />
                  <span className="text-[0.7rem] font-semibold leading-tight text-foreground-muted">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {isIosMode ? (
            <Button variant="primary" size="lg" className="w-full" onClick={handleDismiss}>
              فهمت، سأثبّته الآن
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              icon={<Download aria-hidden="true" className="h-4 w-4" />}
              className="w-full"
              onClick={() => void handleInstall()}
            >
              تثبيت التطبيق الآن
            </Button>
          )}
          {!isIosMode ? (
            <Button variant="ghost" size="lg" className="w-full" onClick={handleDismiss}>
              لاحقاً
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
