import { BadgeCheck, Crown, FileBadge, Gift, Stamp } from 'lucide-react';

import { AdSignature } from '../AdSignature';
import type { AdDesignProps } from '../types';
import { VARIANT_THEME } from '../variantTheme';
import { AdBadge, AdCta, AdGhostButton } from './common';

/* 16 — عرض ترويجي ببطاقة هدية */
export function Design16PromoOffer({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  return (
    <div dir="rtl" className="relative overflow-hidden">
      <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l ${theme.accentBar}`} />
      <div className="p-6 pe-12 text-center sm:p-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/25 bg-fuchsia-500/12 px-3 py-1 text-[11px] font-extrabold text-fuchsia-200">
          <Gift className="h-3.5 w-3.5" aria-hidden="true" /> عرض خاص لفترة محدودة
        </span>
        <span aria-hidden="true" className="mx-auto mt-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-fuchsia-500/30 to-indigo-500/30 shadow-[0_0_40px_-8px_rgba(217,70,239,0.7)]">
          <Crown className="h-8 w-8 text-amber-300" aria-hidden="true" />
        </span>
        <h2 className="mt-3 font-display text-xl font-extrabold text-foreground">{content.title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-foreground-muted">{content.body}</p>
        <div className="mx-auto mt-3 flex max-w-xs items-center justify-center gap-2 text-xs">
          <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-bold text-foreground-muted line-through">خصم 0%</span>
          <span className="rounded-lg border border-emerald-400/25 bg-emerald-500/12 px-3 py-1.5 font-extrabold text-emerald-300">متاح الآن</span>
        </div>
        <div className="mx-auto mt-4 flex max-w-sm flex-col gap-2">
          <AdCta content={content} className="btn-primary w-full" />
          <button type="button" onClick={onClose} className="h-10 text-xs font-bold text-foreground-subtle hover:text-foreground">لا شكراً</button>
        </div>
        <div className="mx-auto max-w-sm text-start"><AdSignature content={content} /></div>
      </div>
    </div>
  );
}

/* 17 — بطل بصورة علوية */
export function Design17HeroImage({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="relative overflow-hidden">
      <div className={`relative flex h-36 items-end justify-between overflow-hidden bg-gradient-to-bl p-5 pe-12 sm:h-44 ${theme.accentBar}`}>
        <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
        <div aria-hidden="true" className="absolute -left-10 -top-10 h-36 w-36 rounded-full bg-white/15 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-12 -right-8 h-40 w-40 rounded-full bg-black/25 blur-2xl" />
        <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <AdBadge content={content} />
      </div>
      <div className="p-6 sm:p-8">
        <h2 className="font-display text-xl font-extrabold text-foreground">{content.title}</h2>
        <p className="mt-2 text-sm leading-7 text-foreground-muted">{content.body}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <AdCta content={content} className="flex-1" />
          <AdGhostButton label="إغلاق" onClose={onClose} />
        </div>
        <AdSignature content={content} />
      </div>
    </div>
  );
}

/* 18 — حبة مضغوطة للتنبيهات الخفيفة */
export function Design18PillCompact({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="p-4 sm:p-5">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 p-3 pe-10 backdrop-blur">
        <span aria-hidden="true" className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${theme.iconBg} ${theme.iconText}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-extrabold text-foreground">{content.title}</p>
          <p className="truncate text-xs text-foreground-muted">{content.body}</p>
        </div>
        {content.link_url && content.link_label && /^https:\/\//.test(content.link_url) ? (
          <a href={content.link_url} target="_blank" rel="noopener noreferrer" className={`inline-flex h-9 shrink-0 items-center rounded-full px-4 text-xs font-bold text-white ${theme.primaryBtn}`}>
            {content.link_label}
          </a>
        ) : (
          <button type="button" onClick={onClose} className="inline-flex h-9 shrink-0 items-center rounded-full border border-white/12 bg-white/5 px-4 text-xs font-bold text-foreground-muted hover:text-foreground">
            تم
          </button>
        )}
      </div>
      <div className="px-1"><AdSignature content={content} /></div>
    </div>
  );
}

/* 19 — قرار مزدوج بزرّين واضحين */
export function Design19DecisionDual({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="relative p-6 text-center sm:p-8">
      <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-l ${theme.accentBar}`} />
      <span aria-hidden="true" className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 ${theme.iconBg} ${theme.iconText}`}>
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <h2 className="mt-3 font-display text-lg font-extrabold text-foreground">{content.title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-foreground-muted">{content.body}</p>
      <div className="mx-auto mt-5 grid max-w-md grid-cols-2 gap-2">
        <AdCta content={content} className="w-full !px-3" />
        <button type="button" onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-xl border border-white/12 bg-white/5 px-3 text-sm font-bold text-foreground hover:bg-white/10">
          قرار لاحقاً
        </button>
      </div>
      <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-foreground-subtle">
        <BadgeCheck className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" /> اختيارك يُحفظ تلقائياً لهذا الإعلان
      </p>
      <div className="mx-auto max-w-md text-start"><AdSignature content={content} /></div>
    </div>
  );
}

/* 20 — خطاب رسمي بالختم والتوقيع */
export function Design20OfficialLetter({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  return (
    <div dir="rtl" className="relative">
      <div aria-hidden="true" className={`h-1.5 w-full bg-gradient-to-l ${theme.accentBar}`} />
      <div className="relative bg-[#faf7ef] p-6 text-[#1d1a33] sm:p-8 dark:bg-[#faf7ef]">
        <div className="flex items-start justify-between gap-4 pe-8">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#1d1a33] text-amber-300">
              <FileBadge className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-display text-sm font-extrabold">منصة وليد عوني التعليمية</p>
              <p className="text-[11px] text-[#1d1a33]/60">بيان رسمي — {theme.label}</p>
            </div>
          </div>
          <span aria-hidden="true" className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center">
            <span className="absolute inset-0 rounded-full border-2 border-dashed border-rose-500/60" />
            <Stamp className="h-6 w-6 text-rose-600" aria-hidden="true" />
          </span>
        </div>
        <h2 className="mt-5 border-b-2 border-[#1d1a33]/10 pb-3 font-display text-lg font-extrabold">{content.title}</h2>
        <p className="mt-3 text-sm leading-8 text-[#1d1a33]/80">{content.body}</p>
        {content.link_url && content.link_label && /^https:\/\//.test(content.link_url) ? (
          <a href={content.link_url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1d1a33] px-5 text-sm font-bold text-white hover:bg-[#2b2660]">
            {content.link_label}
          </a>
        ) : null}
        {content.showSignature ? (
          <div className="mt-5 flex items-end justify-between border-t-2 border-[#1d1a33]/10 pt-4" data-testid="ad-signature">
            <div>
              <p className="text-xs font-extrabold">{content.signatureName?.trim() || 'إدارة منصة وليد عوني'}</p>
              <p className="mt-0.5 text-[11px] text-[#1d1a33]/60">{content.signatureTitle?.trim() || 'التوقيع الرسمي للإدارة'}</p>
              <p className="mt-1 text-[11px] text-[#1d1a33]/50">التاريخ: {new Date().toLocaleDateString('ar-EG')}</p>
            </div>
            <span dir="ltr" aria-hidden="true" className="font-display text-2xl italic text-[#1d1a33]/70">W. Awny</span>
          </div>
        ) : null}
      </div>
      <div className="flex gap-2 bg-[#0e0b22] p-4">
        <button type="button" onClick={onClose} className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-white/12 bg-white/5 px-5 text-sm font-bold text-foreground hover:bg-white/10">
          إغلاق البيان
        </button>
      </div>
    </div>
  );
}
