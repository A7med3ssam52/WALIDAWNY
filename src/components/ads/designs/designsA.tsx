import { Megaphone, Sparkles } from 'lucide-react';

import { AdSignature } from '../AdSignature';
import type { AdDesignProps } from '../types';
import { VARIANT_THEME } from '../variantTheme';
import { AdBadge, AdCta, AdGhostButton } from './common';

/* 01 — كلاسيك زجاجي وسطي: أيقونة علوية + عنوان + نص + أزرار */
export function Design01ClassicCenter({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="relative p-6 pt-5 sm:p-8">
      <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-l ${theme.accentBar}`} />
      <div aria-hidden="true" className={`pointer-events-none absolute -top-20 start-1/2 h-48 w-72 -translate-x-1/2 rounded-full blur-3xl ${theme.glow}`} />
      <div className="relative pe-10">
        <AdBadge content={content} />
        <div className="mt-4 flex items-start gap-4">
          <span aria-hidden="true" className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border ${theme.iconBg} ${theme.iconText}`}>
            <Icon className="h-7 w-7" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-extrabold leading-snug text-foreground">{content.title}</h2>
            <p className="mt-2 text-sm leading-7 text-foreground-muted">{content.body}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <AdCta content={content} className="flex-1" />
          <AdGhostButton label="فهمت، شكراً" onClose={onClose} />
        </div>
        <AdSignature content={content} />
      </div>
    </div>
  );
}

/* 02 — شريط علوي منبثق: مضغوط أفقي بأيقونة جانبية */
export function Design02TopSheet({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="relative">
      <div aria-hidden="true" className={`h-1.5 w-full bg-gradient-to-l ${theme.accentBar}`} />
      <div className="flex items-center gap-3 p-4 pe-12 sm:p-5 sm:pe-14">
        <span aria-hidden="true" className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${theme.iconBg} ${theme.iconText}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-foreground">{content.title}</p>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-6 text-foreground-muted">{content.body}</p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <AdCta content={content} className="!h-10 !px-4 !text-xs" />
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-xl border border-white/12 bg-white/5 px-4 text-xs font-bold text-foreground-muted hover:bg-white/10 hover:text-foreground">
            إغلاق
          </button>
        </div>
      </div>
      <div className="px-4 pb-4 sm:hidden">
        <div className="flex gap-2">
          <AdCta content={content} className="flex-1 !h-10 !text-xs" />
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-xl border border-white/12 bg-white/5 px-4 text-xs font-bold text-foreground-muted">
            إغلاق
          </button>
        </div>
      </div>
      <div className="mx-4 mb-4 sm:mx-5"><AdSignature content={content} /></div>
    </div>
  );
}

/* 03 — ورقة سفلية موبايل: مقبض سحب + محتوى مريح للإبهام */
export function Design03BottomSheet({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="relative px-5 pb-6 pt-3 sm:px-8 sm:pb-8">
      <div aria-hidden="true" className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/20" />
      <div aria-hidden="true" className={`absolute inset-x-8 top-8 h-24 rounded-full blur-3xl ${theme.glow}`} />
      <div className="relative pe-8 text-center">
        <span aria-hidden="true" className={`mx-auto inline-flex h-16 w-16 items-center justify-center rounded-3xl border ${theme.iconBg} ${theme.iconText} shadow-lg`}>
          <Icon className="h-8 w-8" aria-hidden="true" />
        </span>
        <div className="mt-3 flex justify-center"><AdBadge content={content} /></div>
        <h2 className="mt-2 font-display text-lg font-extrabold text-foreground">{content.title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-foreground-muted">{content.body}</p>
        <div className="mx-auto mt-4 grid max-w-md gap-2">
          <AdCta content={content} className="w-full" />
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-xl text-sm font-bold text-foreground-subtle hover:text-foreground">
            ليس الآن
          </button>
        </div>
        <div className="mx-auto max-w-md text-start"><AdSignature content={content} /></div>
      </div>
    </div>
  );
}

/* 04 — درج جانبي: عمودي بمساحة قراءة مريحة */
export function Design04SideDrawer({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="relative flex min-h-[50dvh] flex-col p-6 pe-12 sm:p-8">
      <div aria-hidden="true" className={`absolute inset-y-0 start-0 w-1.5 bg-gradient-to-b ${theme.accentBar}`} />
      <AdBadge content={content} />
      <span aria-hidden="true" className={`mt-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border ${theme.iconBg} ${theme.iconText}`}>
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <h2 className="mt-4 font-display text-2xl font-extrabold leading-snug text-foreground">{content.title}</h2>
      <p className="mt-3 flex-1 text-sm leading-8 text-foreground-muted">{content.body}</p>
      <div className="mt-6 grid gap-2">
        <AdCta content={content} className="w-full" />
        <AdGhostButton label="تصفح لاحقاً" onClose={onClose} />
      </div>
      <AdSignature content={content} />
    </div>
  );
}

/* 05 — مقسم صورة/محتوى: لوحة إعلانية بجانب بصري */
export function Design05SplitMedia({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="relative grid overflow-hidden sm:grid-cols-[220px_1fr]">
      <div aria-hidden="true" className={`relative flex min-h-36 flex-col items-center justify-center gap-2 overflow-hidden bg-gradient-to-bl p-6 ${theme.accentBar}`}>
        <span className="absolute inset-0 bg-black/25" />
        <Megaphone aria-hidden="true" className="relative h-10 w-10 text-white drop-shadow-lg" />
        <span className="relative inline-flex items-center gap-1 rounded-full bg-black/30 px-3 py-1 text-[11px] font-bold text-white backdrop-blur">
          <Sparkles className="h-3 w-3" aria-hidden="true" /> إعلان مميز
        </span>
        <div aria-hidden="true" className="absolute -bottom-8 -start-8 h-28 w-28 rounded-full bg-white/20 blur-2xl" />
      </div>
      <div className="relative p-6 pe-12 sm:p-7">
        <AdBadge content={content} />
        <h2 className="mt-3 flex items-center gap-2 font-display text-lg font-extrabold text-foreground">
          <Icon className={`h-5 w-5 ${theme.iconText}`} aria-hidden="true" /> {content.title}
        </h2>
        <p className="mt-2 text-sm leading-7 text-foreground-muted">{content.body}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <AdCta content={content} className="flex-1" />
          <AdGhostButton label="تجاهل" onClose={onClose} />
        </div>
        <AdSignature content={content} />
      </div>
    </div>
  );
}
