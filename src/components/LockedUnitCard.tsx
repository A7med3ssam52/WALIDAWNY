import { Lock } from 'lucide-react';

import { buildWhatsAppLink } from '../lib/format';
import type { PublicUnitPrice } from '../types/database';
import { Button } from './Button';
import { Card } from './Card';
import { PriceTag } from './PriceTag';
import { WhatsAppIcon } from './WhatsAppIcon';

interface LockedUnitCardProps {
  unit: PublicUnitPrice;
  whatsappNumber?: string | null;
  whatsappMessage?: string | null;
  onRedeem?: () => void;
}

export function LockedUnitCard({
  unit,
  whatsappNumber,
  whatsappMessage,
  onRedeem,
}: LockedUnitCardProps) {
  const whatsappLink = whatsappNumber ? buildWhatsAppLink(whatsappNumber, whatsappMessage) : null;
  return (
    <Card title={unit.unit_name} subtitle={unit.grade_name}>
      <div className="flex flex-col gap-4">
        <PriceTag pricing={unit} />
        <div className="flex flex-wrap items-center gap-2">
          {whatsappLink ? (
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
          {onRedeem ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onRedeem}
              icon={<Lock aria-hidden="true" className="h-4 w-4" />}
            >
              تفعيل بكود
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
