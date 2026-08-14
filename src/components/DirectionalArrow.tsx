import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DirectionalArrowProps {
  direction: 'back' | 'forward';
  size?: number;
  className?: string;
}

/**
 * Logical directional arrow: "back" points to the start of the reading direction,
 * "forward" to the end. The icon is flipped in RTL layouts via the `rtl:` variant.
 */
export function DirectionalArrow({ direction, size = 16, className }: DirectionalArrowProps) {
  const Icon = direction === 'forward' ? ChevronRight : ChevronLeft;
  return (
    <span aria-hidden="true" className={`rtl:rotate-180 ${className ?? ''}`}>
      <Icon size={size} />
    </span>
  );
}
