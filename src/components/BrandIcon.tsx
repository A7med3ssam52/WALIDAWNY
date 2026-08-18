interface BrandIconProps {
  className?: string;
}

export function BrandIcon({ className }: BrandIconProps) {
  return (
    <img
      src="/icons/icon-192.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`shrink-0 rounded-xl object-cover shadow-[0_0_22px_-4px_rgba(129,140,248,0.8)] ${className ?? ''}`}
    />
  );
}