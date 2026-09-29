import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant =
  'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const baseClasses =
  'inline-flex items-center justify-center gap-2 rounded-full font-bold transition-[transform,background-color,box-shadow,border-color] duration-200 select-none ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.98]';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'btn-primary text-primary-foreground',
  secondary:
    'bg-surface-muted text-foreground border border-border hover:bg-border hover:border-primary/40',
  outline:
    'bg-surface text-foreground border border-border hover:border-primary/50 hover:bg-primary-soft/40',
  ghost: 'bg-transparent text-foreground-muted hover:bg-surface-muted hover:text-foreground border border-transparent',
  destructive: 'bg-[#7A3B36] text-[#F3D9D3] border border-[#a86a63]/30 hover:bg-[#874540]',
  danger: 'bg-[#7A3B36] text-[#F3D9D3] border border-[#a86a63]/30 hover:bg-[#874540]',
  link: 'bg-transparent text-primary-strong underline-offset-4 hover:underline p-0 h-auto',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-10 px-4 text-xs gap-1.5',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-sm sm:text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  icon,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    baseClasses,
    variantClasses[variant],
    variant === 'link' ? '' : sizeClasses[size],
    loading ? 'cursor-wait' : '',
    className ?? '',
  ].join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : icon ? (
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}
