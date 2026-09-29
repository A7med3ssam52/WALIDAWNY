import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  outline?: boolean;
  icon?: ReactNode;
}

const textClasses: Record<BadgeVariant, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
  neutral: 'text-foreground-muted',
};

const bgClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500/10',
  warning: 'bg-amber-500/10',
  error: 'bg-error/[0.07]',
  info: 'bg-sky-500/10',
  neutral: 'bg-surface-muted',
};

const borderClasses: Record<BadgeVariant, string> = {
  success: 'border-emerald-600/25',
  warning: 'border-amber-600/25',
  error: 'border-error/25',
  info: 'border-sky-600/25',
  neutral: 'border-border',
};

export function Badge({
  variant = 'neutral',
  outline = false,
  icon,
  children,
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${textClasses[variant]} ${
        outline ? 'bg-surface' : bgClasses[variant]
      } ${borderClasses[variant]} ${className ?? ''}`}
      {...rest}
    >
      {icon ? (
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
