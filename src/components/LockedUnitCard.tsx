import { AlertCircle } from 'lucide-react';

import { buildWhatsAppLink } from '../lib/format';
import type { PublicUnitPrice } from '../types/database';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { PriceTag } from './PriceTag';
import { RedeemCodeForm } from './RedeemCodeForm';
import { WhatsAppIcon } from './WhatsAppIcon';

interface LockedUnitCardProps {
  unit: PublicUnitPrice | null;
  unitName: string;
  gradeName?: string;
  whatsappNumber?: string | null;
  whatsappMessage?: string | null;
  onRedeem?: (code: string) => Promise<boolean>;
  redeemBusy?: boolean;
  redeemError?: string | null;
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
}: LockedUnitCardProps) {
  const whatsappLink = whatsappNumber ? buildWhatsAppLink(whatsappNumber, whatsappMessage) : null;
  const hasPrice = unit !== null;
  const isFree = hasPrice && ((unit as { is_free?: boolean }).is_free || unit.total_price === 0);

  if (isFree) {
    return (
      <Card title={unitName} subtitle={`${unit.grade_name ?? gradeName ?? ''} — مجاني`} className="conic-ring spotlight-card">
        <div className="flex flex-col gap-4">
          <PriceTag pricing={unit} />
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success" className="shadow-[0_0_16px_-6px_rgba(52,211,153,0.5)]">مجاني</Badge>
            <span className="text-xs text-foreground-subtle">متاح لجميع الطلاب بدون كود</span>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card title={unitName} subtitle={hasPrice ? (unit.grade_name ?? gradeName ?? '') : 'السعر غير محدد — تواصل مع الإدارة'} className="conic-ring spotlight-card">
      <div className="flex flex-col gap-4">
        {hasPrice ? (
          <PriceTag pricing={unit} />
        ) : (
          <div className="glass-soft flex items-center gap-3 p-3 rounded-xl">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
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
          <div className="border-t border-white/5 pt-4">
            <RedeemCodeForm
              onSubmit={onRedeem}
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
