import { Tag } from 'lucide-react';

import { formatPrice } from '../lib/format';
import type { PublicUnitPrice, UnitPricingWithUnit } from '../types/database';

const numberFormatter = new Intl.NumberFormat('ar-EG');

interface PriceTagProps {
  pricing: UnitPricingWithUnit | PublicUnitPrice;
}

export function PriceTag({ pricing }: PriceTagProps) {
  const isFree = (pricing as { is_free?: boolean }).is_free || pricing.total_price === 0;
  if (isFree) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[rgba(127,191,142,0.25)] bg-[rgba(127,191,142,0.08)] px-3 py-2.5">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(127,191,142,0.12)] text-success"
        >
          <Tag className="h-4 w-4" />
        </span>
        <div>
          <p className="font-bold text-success">مجاني</p>
          <p className="text-xs text-foreground-muted">متاح لجميع الطلاب بدون كود</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted px-3 py-2.5">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong"
      >
        <Tag className="h-4 w-4" />
      </span>
      <div>
        <p className="font-display font-bold text-foreground" dir="ltr">{formatPrice(pricing.total_price)}</p>
        <p className="text-xs text-foreground-subtle">
          سعر {numberFormatter.format(pricing.base_price)} ج.م + رسوم منصة{' '}
          {numberFormatter.format(pricing.platform_fee)} ج.م
        </p>
      </div>
    </div>
  );
}
