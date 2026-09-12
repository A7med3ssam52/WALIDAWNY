import { ADMIN_DEFAULT_SIGNATURE } from '../../lib/announcements';
import type { AdContent } from './types';

interface Props {
  content: AdContent;
  tone?: 'light' | 'muted' | 'paper';
}

/**
 * التوقيع أسفل الإعلان — عربي فقط بخط يدوي (Aref Ruqaa).
 * يظهر في كل التصاميم عند تفعيله، ويعرض اسم الموقّع + الصفة إن وُجدت.
 */
export function AdSignature({ content, tone = 'muted' }: Props) {
  if (!content.showSignature) return null;
  const name = content.signatureName?.trim() || ADMIN_DEFAULT_SIGNATURE;
  const title = content.signatureTitle?.trim() || '';
  const isPaper = tone === 'paper';

  return (
    <div
      className={`mt-4 border-t pt-3 ${
        isPaper ? 'border-[#1d1a33]/10' : tone === 'light' ? 'border-white/15' : 'border-white/10'
      }`}
      data-testid="ad-signature"
    >
      <p
        className={`text-[11px] font-bold ${
          isPaper ? 'text-[#1d1a33]/60' : 'text-foreground-subtle'
        }`}
      >
        التوقيع
      </p>
      <p
        className={`font-signature mt-1 text-[26px] leading-[1.9] ${
          isPaper ? 'text-[#1d1a33]' : 'text-foreground'
        }`}
      >
        {name}
      </p>
      {title ? (
        <p className={`text-[11px] ${isPaper ? 'text-[#1d1a33]/60' : 'text-foreground-subtle'}`}>
          {title}
        </p>
      ) : null}
    </div>
  );
}
