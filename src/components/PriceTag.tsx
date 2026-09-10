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
      <div className="flex items-center gap-3 rounded-xl border border-emerald-400/15 bg-emerald-500/10 px-3 py-2.5 backdrop-blur">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_16px_-6px_rgba(52,211,153,0.5)]"
        >
          <Tag className="h-4 w-4" />
        </span>
        <div>
          <p className="font-bold text-emerald-300">مجاني</p>
          <p className="text-xs text-emerald-200/70">متاح لجميع الطلاب بدون كود</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5 backdrop-blur">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-indigo-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_16px_-6px_rgba(129,140,248,0.5)]"
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
