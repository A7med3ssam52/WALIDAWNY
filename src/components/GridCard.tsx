import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface GridCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  border?: boolean;
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
};

export function GridCard({
  children,
  className,
  hover = true,
  padding = 'md',
  border = true,
}: GridCardProps) {
  return (
    <div
      className={cn(
        'flat-card glass-card relative overflow-hidden',
        hover && 'flat-card-hover group',
        paddingStyles[padding],
        border && 'border border-border-muted',
        className,
      )}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}
