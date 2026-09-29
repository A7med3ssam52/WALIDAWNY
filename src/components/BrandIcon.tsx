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
      className={`shrink-0 rounded-xl object-cover ${className ?? ''}`}
    />
  );
}
