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
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300"
        >
          <Tag className="h-4 w-4" />
        </span>
        <div>
          <p className="font-semibold text-emerald-300">مجاني</p>
          <p className="text-xs text-foreground-subtle">متاح لجميع الطلاب بدون كود</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"
      >
        <Tag className="h-4 w-4" />
      </span>
      <div>
        <p className="font-semibold text-foreground">{formatPrice(pricing.total_price)}</p>
        <p className="text-xs text-foreground-subtle">
          سعر {numberFormatter.format(pricing.base_price)} ج.م + رسوم منصة{' '}
          {numberFormatter.format(pricing.platform_fee)} ج.م
        </p>
      </div>
    </div>
  );
}
