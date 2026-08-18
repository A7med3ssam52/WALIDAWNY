import { useEffect, useRef, type ReactNode } from 'react';

import { Button } from './Button';

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'إلغاء',
  danger = false,
  loading = false,
  children,
  onConfirm,
  onCancel,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useRef<string>('').current || 'modal-title';
  const descriptionId = useRef<string>('').current || 'modal-description';
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable?.[0] ?? dialog)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!loading) {
          onCancelRef.current();
        }
        return;
      }
      if (event.key !== 'Tab' || !dialog) {
        return;
      }
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (item) => !item.hasAttribute('disabled') && item.tabIndex !== -1,
      );
      if (items.length === 0) {
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previouslyFocused.current?.focus();
    };
  }, [open, loading]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="glass-overlay fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4 animate-fade-in"
      onClick={(event) => {
        if (event.target === event.currentTarget && !loading && !danger) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-state={open ? 'open' : 'closed'}
        aria-describedby={description ? descriptionId : undefined}
        className="glass-panel w-full max-w-md rounded-t-xl px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-5 sm:rounded-lg sm:p-6 max-h-[90dvh] overflow-y-auto animate-scale-in"
      >
        <h2 id={titleId} className="text-lg font-bold text-foreground">
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-foreground-muted">
            {description}
          </p>
        ) : null}
        {children}
        <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row sm:gap-3">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
            className="sm:order-first"
          >
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
