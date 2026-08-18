import { Lock, AlertCircle } from 'lucide-react';

import { buildWhatsAppLink } from '../lib/format';
import type { PublicUnitPrice } from '../types/database';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { PriceTag } from './PriceTag';
import { WhatsAppIcon } from './WhatsAppIcon';

interface LockedUnitCardProps {
  unit: PublicUnitPrice | null;
  unitName: string;
  gradeName?: string;
  whatsappNumber?: string | null;
  whatsappMessage?: string | null;
  onRedeem?: () => void;
}

export function LockedUnitCard({
  unit,
  unitName,
  gradeName,
  whatsappNumber,
  whatsappMessage,
  onRedeem,
}: LockedUnitCardProps) {
  const whatsappLink = whatsappNumber ? buildWhatsAppLink(whatsappNumber, whatsappMessage) : null;
  const hasPrice = unit !== null;

  return (
    <Card title={unitName} subtitle={hasPrice ? (unit.grade_name ?? gradeName ?? '') : 'السعر غير محدد — تواصل مع الإدارة'}>
      <div className="flex flex-col gap-4">
        {hasPrice ? (
          <PriceTag pricing={unit} />
        ) : (
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-border-muted">
            <AlertCircle className="h-5 w-5 text-warning" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">السعر غير محدد</p>
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
          {hasPrice && onRedeem ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onRedeem}
              icon={<Lock aria-hidden="true" className="h-4 w-4" />}
            >
              تفعيل بكود
            </Button>
          ) : null}
          {!hasPrice ? (
            <Badge variant="warning" outline>
              السعر غير محدد
            </Badge>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
