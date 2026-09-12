import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

import type { AdPlacement, AdSize } from './types';

interface AdModalShellProps {
  open: boolean;
  onClose: () => void;
  placement?: AdPlacement;
  size?: AdSize;
  label: string;
  dismissible?: boolean;
  showCloseButton?: boolean;
  children: ReactNode;
  testId?: string;
}

const SIZE_CLASS: Record<AdSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function placementWrap(placement: AdPlacement): string {
  switch (placement) {
    case 'top':
      return 'items-start justify-center pt-[8vh] sm:pt-[10vh]';
    case 'bottom':
      return 'items-end justify-center p-0 sm:items-end sm:p-6 sm:pb-8';
    case 'side':
      return 'items-stretch justify-start p-0 sm:p-0';
    case 'fullscreen':
      return 'items-center justify-center p-2 sm:p-6';
    default:
      return 'items-center justify-center p-4 sm:p-6';
  }
}

function placementPanel(placement: AdPlacement): string {
  switch (placement) {
    case 'top':
      return 'rounded-2xl animate-slide-in-top w-full';
    case 'bottom':
      return 'rounded-t-3xl sm:rounded-3xl animate-rise w-full';
    case 'side':
      return 'rounded-e-3xl sm:rounded-3xl animate-slide-in-start min-h-[60dvh] sm:min-h-0 w-full max-w-md me-auto h-full sm:h-auto';
    case 'fullscreen':
      return 'rounded-3xl animate-scale-in w-full min-h-[70dvh]';
    default:
      return 'rounded-3xl animate-scale-in w-full';
  }
}

/**
 * غلاف Modal احترافي للإعلانات:
 * - RTL، فخ focus، إغلاق بـ Escape، قفل سكرول، إرجاع الفوكس
 * - 5 مواضع: وسط / علوي / سفلي / جانبي / ملء الشاشة
 * - زر إغلاق اختياري + إغلاق بالضغط على الخلفية (عند dismissible)
 */
export function AdModalShell({
  open,
  onClose,
  placement = 'center',
  size = 'md',
  label,
  dismissible = true,
  showCloseButton = true,
  children,
  testId = 'ad-modal',
}: AdModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const first = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (first?.[0] ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (dismissible) onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
      );
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus.current?.focus();
    };
  }, [open, dismissible]);

  if (!open) return null;

  const isSide = placement === 'side';

  return (
    <div
      className={`glass-overlay fixed inset-0 z-[120] flex animate-fade-in ${placementWrap(placement)}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose();
      }}
      data-testid={`${testId}-overlay`}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-testid={testId}
        data-placement={placement}
        className={`glass-panel relative overflow-hidden outline-none ${SIZE_CLASS[size]} ${placementPanel(placement)} ${
          isSide ? '' : 'max-h-[90dvh] overflow-y-auto'
        } ${placement === 'bottom' ? 'max-h-[92dvh] overflow-y-auto' : ''}`}
      >
        {/* hairline علوي */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
        />
        {showCloseButton && dismissible ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق الإعلان"
            className="absolute end-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-foreground-muted backdrop-blur transition-colors hover:bg-white/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            data-testid={`${testId}-close`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        {children}
      </div>
    </div>
  );
}
