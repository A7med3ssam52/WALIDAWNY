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
    <article className="glass-card glass-card-hover conic-ring spotlight-card group relative flex h-full flex-col overflow-hidden p-4 sm:p-5">
      {/* top accent hairline */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      {/* soft icon header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <span aria-hidden="true" className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-indigo-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_20px_-8px_rgba(129,140,248,0.5)] group-hover:scale-105 group-hover:rotate-1 transition-transform duration-300">
            {isPurchased ? <CheckCircle2 className="h-5 w-5" /> : isLocked ? <Lock className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="font-display text-base font-bold leading-tight text-foreground sm:text-lg truncate">{name}</p>
            {gradeName && (
              <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-foreground-subtle border border-white/5">
                <PackageOpen className="h-3 w-3" aria-hidden="true" />
                {gradeName}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showFree ? (
            <Badge variant="success" className="text-xs shadow-[0_0_16px_-6px_rgba(52,211,153,0.5)]">مجاني</Badge>
          ) : isPurchased ? (
            <Badge variant="success" className="text-xs shadow-[0_0_16px_-6px_rgba(52,211,153,0.5)]">
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
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/20 px-3 py-1 text-xs font-bold text-emerald-300">✦ مجاني — متاح بدون كود</div>
      ) : price !== undefined && price !== null && !isPurchased ? (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-foreground-subtle">السعر</span>
          <span className="rounded-full bg-white/6 border border-white/10 px-3 py-1 text-sm font-bold text-foreground" dir="ltr">
            {typeof price === 'number' ? formatPrice(price) : price} <span className="text-xs font-normal text-foreground-subtle">ج.م</span>
          </span>
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-white/5">
        {children}
        {onAction && (
          <button
            type="button"
            onClick={onAction}
            className={cn(
              'btn-primary inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white',
              'transition-all duration-200 hover:scale-[1.015] active:scale-[0.98] shadow-[0_8px_20px_-10px_rgba(99,102,241,0.6)]'
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