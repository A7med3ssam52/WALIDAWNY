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
  onAction,
  actionLabel = 'افتح الوحدة',
  actionIcon,
  children,
}: UnitCardProps) {
  return (
    <article className="glass-card glass-card-hover group p-4 sm:p-5 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-foreground truncate">{name}</p>
          {gradeName && (
            <p className="mt-0.5 text-xs text-foreground-muted flex items-center gap-1">
              <PackageOpen className="h-3 w-3" aria-hidden="true" />
              {gradeName}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isPurchased ? (
            <Badge variant="success" className="text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" aria-hidden="true" />
              مملوكة
            </Badge>
          ) : isLocked ? (
            <Badge variant="warning" outline className="text-xs">
              <Lock className="h-3 w-3 mr-1" aria-hidden="true" />
              مقفولة
            </Badge>
          ) : (
            <Badge variant="info" outline className="text-xs">
              متاحة
            </Badge>
          )}
        </div>
      </div>

      {price && !isPurchased && (
        <div className="mb-4 text-sm text-foreground-muted" dir="ltr">
          السعر: {typeof price === 'number' ? formatPrice(price) : price}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-white/5">
        {children}
        {onAction && (
          <button
            type="button"
            onClick={onAction}
            className={cn(
              'btn-primary inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white w-full',
              'transition-all duration-200 hover:scale-[1.02]'
            )}
          >
            {actionIcon || <PlayCircle className="h-4 w-4" aria-hidden="true" />}
            {actionLabel}
          </button>
        )}
      </div>

      <div className="absolute inset-0 -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
      </div>
    </article>
  );
}