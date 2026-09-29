import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

import { buildWhatsAppLink } from '../lib/format';
import type { PublicUnitPrice } from '../types/database';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { PriceTag } from './PriceTag';
import { RedeemCodeForm } from './RedeemCodeForm';
import { VoucherRedeemOption } from './VoucherRedeemOption';
import { WhatsAppIcon } from './WhatsAppIcon';

interface VoucherOption {
  /** Show the explicit opt-in (student holds a valid voucher). */
  available: boolean;
  /** Unit-specific platform fee that will be waived. */
  waivedFee: number | null;
  /** e.g. "صالح 12 يوم". */
  validityLabel?: string | null;
}

interface LockedUnitCardProps {
  unit: PublicUnitPrice | null;
  unitName: string;
  gradeName?: string;
  whatsappNumber?: string | null;
  whatsappMessage?: string | null;
  onRedeem?: (code: string, useVoucher?: boolean) => Promise<boolean>;
  redeemBusy?: boolean;
  redeemError?: string | null;
  voucher?: VoucherOption;
  voucherTestId?: string;
}

export function LockedUnitCard({
  unit,
  unitName,
  gradeName,
  whatsappNumber,
  whatsappMessage,
  onRedeem,
  redeemBusy = false,
  redeemError = null,
  voucher,
  voucherTestId,
}: LockedUnitCardProps) {
  const [useVoucherChecked, setUseVoucherChecked] = useState(false);
  const whatsappLink = whatsappNumber ? buildWhatsAppLink(whatsappNumber, whatsappMessage) : null;
  const hasPrice = unit !== null;
  const isFree = hasPrice && ((unit as { is_free?: boolean }).is_free || unit.total_price === 0);
  const showVoucherOption = Boolean(onRedeem && voucher?.available);

  if (isFree) {
    return (
      <Card title={unitName} subtitle={`${unit.grade_name ?? gradeName ?? ''} — مجاني`}>
        <div className="flex flex-col gap-4">
          <PriceTag pricing={unit} />
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">مجاني</Badge>
            <span className="text-xs text-foreground-subtle">متاح لجميع الطلاب بدون كود</span>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card title={unitName} subtitle={hasPrice ? (unit.grade_name ?? gradeName ?? '') : 'السعر غير محدد — تواصل مع الإدارة'}>
      <div className="flex flex-col gap-4">
        {hasPrice ? (
          <PriceTag pricing={unit} />
        ) : (
          <div className="glass-soft flex items-center gap-3 p-3 rounded-xl">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(217,167,95,0.1)] text-warning">
              <AlertCircle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-bold text-foreground">السعر غير محدد</p>
              <p className="text-xs text-foreground-subtle">تواصل مع الإدارة لمعرفة السعر وتفعيل الوحدة</p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {hasPrice && whatsappLink ? (
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="inline-flex">
              <Button
                variant="secondary"
                size="sm"
                icon={<WhatsAppIcon className="h-4 w-4" />}
              >
                تواصل لتفعيل الوحدة
              </Button>
            </a>
          ) : null}
          {!hasPrice ? (
            <Badge variant="warning" outline>
              السعر غير محدد
            </Badge>
          ) : null}
        </div>
        {onRedeem ? (
          <div className="border-t border-border-muted pt-4">
            {showVoucherOption ? (
              <div className="mb-3">
                <VoucherRedeemOption
                  waivedFee={voucher?.waivedFee ?? null}
                  validityLabel={voucher?.validityLabel}
                  checked={useVoucherChecked}
                  onChange={setUseVoucherChecked}
                  testId={voucherTestId}
                />
              </div>
            ) : null}
            <RedeemCodeForm
              onSubmit={(code) => onRedeem(code, showVoucherOption && useVoucherChecked)}
              busy={redeemBusy}
              error={redeemError}
              inputLabel={unitName ? `كود تفعيل ${unitName}` : 'كود التفعيل'}
              placeholder="WLDN-XXXXXXXXXXXX"
              submitLabel="تفعيل بالكود"
            />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
