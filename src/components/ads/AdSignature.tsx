import { PenLine } from 'lucide-react';

import type { AdContent } from './types';

interface Props {
  content: AdContent;
  tone?: 'light' | 'muted';
}

/**
 * التوقيع الرسمي أسفل الإعلان — يظهر في كل التصاميم الـ20 عند تفعيله.
 * يعرض اسم الموقّع + الصفة + خط توقيع بخط عربي مميز.
 */
export function AdSignature({ content, tone = 'muted' }: Props) {
  if (!content.showSignature) return null;
  const name = content.signatureName?.trim() || 'إدارة منصة وليد عوني';
  const title = content.signatureTitle?.trim() || 'التوقيع الرسمي للإدارة';

  return (
    <div
      className={`mt-4 flex items-center justify-between gap-3 border-t pt-3 ${
        tone === 'light' ? 'border-white/15' : 'border-white/10'
      }`}
      data-testid="ad-signature"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-foreground-muted"
        >
          <PenLine className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-xs font-bold text-foreground">{name}</span>
          <span className="block text-[11px] text-foreground-subtle">{title}</span>
        </span>
      </div>
      <span
        aria-hidden="true"
        dir="ltr"
        className="font-display text-lg italic text-foreground-subtle/80 select-none"
        style={{ fontFamily: "'Changa', 'Cairo', cursive" }}
      >
        W. Awny
      </span>
    </div>
  );
}
