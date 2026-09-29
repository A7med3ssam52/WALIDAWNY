import type { ReactNode } from 'react';
import { PlayCircle, Lock, CheckCircle2, PackageOpen } from 'lucide-react';
import { Badge } from './Badge';
import { cn } from '../lib/cn';
import { formatPrice } from '../lib/format';

interface UnitCardProps {
  name: string;
  gradeName?: string;
  price?: string | number;
  isPurchased: boolean;
  isLocked?: boolean;
  isFree?: boolean;
  onAction?: () => void;
  actionLabel?: string;
  actionIcon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function UnitCard({
  name,
  gradeName,
  price,
  isPurchased,
  isLocked = false,
  isFree = false,
  onAction,
  actionLabel = 'افتح الوحدة',
  actionIcon,
  children,
}: UnitCardProps) {
  const showFree = isFree || price === 0;
  return (
    <article className="glass-card glass-card-hover group relative flex h-full flex-col overflow-hidden p-4 sm:p-5">
      {/* soft icon header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <span aria-hidden="true" className="card-chip hidden sm:flex h-11 w-11 shrink-0 items-center justify-center">
            {isPurchased ? <CheckCircle2 className="h-5 w-5" /> : isLocked ? <Lock className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="font-display text-base font-bold leading-tight text-foreground sm:text-lg truncate">{name}</p>
            {gradeName && (
              <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-foreground-subtle border border-border-muted">
                <PackageOpen className="h-3 w-3" aria-hidden="true" />
                {gradeName}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showFree ? (
            <Badge variant="success" className="text-xs">مجاني</Badge>
          ) : isPurchased ? (
            <Badge variant="success" className="text-xs">
              <CheckCircle2 className="h-3 w-3 me-1" aria-hidden="true" />
              مملوكة
            </Badge>
          ) : isLocked ? (
            <Badge variant="warning" outline className="text-xs">
              <Lock className="h-3 w-3 me-1" aria-hidden="true" />
              مقفولة
            </Badge>
          ) : (
            <Badge variant="info" outline className="text-xs">
              متاحة
            </Badge>
          )}
        </div>
      </div>

      {showFree && !isPurchased ? (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[rgba(127,191,142,0.08)] border border-[rgba(127,191,142,0.25)] px-3 py-1 text-xs font-bold text-success">✦ مجاني — متاح بدون كود</div>
      ) : price !== undefined && price !== null && !isPurchased ? (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-foreground-subtle">السعر</span>
          <span className="rounded-full bg-surface-muted border border-border px-3 py-1 text-sm font-bold text-foreground" dir="ltr">
            {typeof price === 'number' ? formatPrice(price) : price} <span className="text-xs font-normal text-foreground-subtle">ج.م</span>
          </span>
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-border-muted">
        {children}
        {onAction && (
          <button
            type="button"
            onClick={onAction}
            className={cn(
              'btn-primary inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold'
            )}
          >
            {actionIcon || <PlayCircle className="h-4 w-4" aria-hidden="true" />}
            {actionLabel}
          </button>
        )}
      </div>
    </article>
  );
}