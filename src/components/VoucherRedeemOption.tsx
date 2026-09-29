import { BadgeCheck } from 'lucide-react';

import { formatPrice } from '../lib/format';

interface VoucherRedeemOptionProps {
  /** Platform fee that will be waived (unit-specific). Omit when unknown. */
  waivedFee?: number | null;
  /** e.g. "صالح 12 يوم" — shown when provided. */
  validityLabel?: string | null;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId?: string;
}

/** "صالح N يوم" label from an ISO expiry timestamp. Null when expired. */
export function voucherValidityLabel(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const days = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
  if (days <= 0) return null;
  return `صالح ${days} ${days === 1 ? 'يوم' : 'أيام'}`;
}

/**
 * Explicit voucher opt-in for unit redemption (0085 streak reward).
 * Rendered only when the student holds a valid voucher; the purchase
 * consumes it ONLY after the student checks this and submits the code.
 */
export function VoucherRedeemOption({
  waivedFee = null,
  validityLabel,
  checked,
  onChange,
  testId = 'voucher-redeem-option',
}: VoucherRedeemOptionProps) {
  return (
    <label
      data-testid={testId}
      className="flex cursor-pointer items-start gap-3 rounded-xl border border-success/30 bg-success/[0.06] p-3"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        data-testid={`${testId}-checkbox`}
        className="mt-0.5 h-5 w-5 shrink-0 accent-success"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-black text-foreground">
          <BadgeCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-success" />
          استخدام قسيمة الإعفاء{waivedFee !== null ? ` — توفر ${formatPrice(waivedFee)}` : ''}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-foreground-muted">
          سيتم إعفاؤك من رسوم المنصة لهذه الوحدة فقط
          {validityLabel ? ` · ${validityLabel}` : ''}
        </span>
      </span>
    </label>
  );
}
