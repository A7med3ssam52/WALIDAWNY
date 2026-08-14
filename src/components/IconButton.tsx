import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  variant?: 'ghost' | 'secondary' | 'danger';
  loading?: boolean;
}

const variantClasses = {
  ghost: 'text-foreground-muted hover:bg-white/6 hover:text-foreground',
  secondary: 'glass-soft text-foreground-muted hover:bg-white/10 hover:text-foreground',
  danger: 'text-rose-300 hover:bg-rose-400/10',
};

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  loading = false,
  disabled,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10 ${variantClasses[variant]} ${className ?? ''}`}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        <span aria-hidden="true">{icon}</span>
      )}
    </button>
  );
}
