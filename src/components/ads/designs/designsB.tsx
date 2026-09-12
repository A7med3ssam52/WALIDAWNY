import { BellRing, PartyPopper } from 'lucide-react';

import { AdSignature } from '../AdSignature';
import type { AdDesignProps } from '../types';
import { VARIANT_THEME } from '../variantTheme';
import { AdBadge, AdCta, AdGhostButton } from './common';

/* 06 — ملء الشاشة: takeover سينمائي */
export function Design06Fullscreen({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="relative flex min-h-[60dvh] flex-col items-center justify-center overflow-hidden p-8 text-center sm:p-12">
      <div aria-hidden="true" className={`absolute inset-0 bg-gradient-to-b ${theme.accentBar} opacity-20`} />
      <div aria-hidden="true" className={`absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full blur-[90px] ${theme.glow}`} />
      <div className="relative pe-0">
        <AdBadge content={content} />
        <span aria-hidden="true" className="mx-auto mt-5 flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-white/8 shadow-2xl backdrop-blur">
          <Icon className={`h-10 w-10 ${theme.iconText}`} aria-hidden="true" />
        </span>
        <h2 className="mx-auto mt-5 max-w-lg font-display text-2xl font-extrabold leading-snug text-foreground sm:text-3xl">{content.title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-8 text-foreground-muted sm:text-base">{content.body}</p>
        <div className="mx-auto mt-6 flex max-w-md flex-col gap-2 sm:flex-row sm:justify-center">
          <AdCta content={content} className="min-w-44" />
          <AdGhostButton label="متابعة التصفح" onClose={onClose} />
        </div>
        <div className="mx-auto mt-4 max-w-md text-start"><AdSignature content={content} /></div>
      </div>
    </div>
  );
}

/* 07 — توست مصغر: مضغوط وسريع */
export function Design07MiniToast({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="relative p-4 pe-12 sm:p-5 sm:pe-14">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${theme.iconBg} ${theme.iconText}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-foreground">{content.title}</p>
          <p className="mt-1 line-clamp-3 text-[13px] leading-6 text-foreground-muted">{content.body}</p>
          <div className="mt-3 flex items-center gap-2">
            {content.link_url && content.link_label && /^https:\/\//.test(content.link_url) ? (
              <a href={content.link_url} target="_blank" rel="noopener noreferrer" className={`inline-flex h-9 items-center rounded-lg px-4 text-xs font-bold text-white ${theme.primaryBtn}`}>
                {content.link_label}
              </a>
            ) : null}
            <button type="button" onClick={onClose} className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-bold text-foreground-subtle hover:text-foreground">
              حسناً
            </button>
          </div>
        </div>
      </div>
      <AdSignature content={content} />
    </div>
  );
}

/* 08 — حلقة نيون فاخرة: conic-ring */
export function Design08NeonRing({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="relative p-6 sm:p-8">
      <div className="conic-ring glass-card relative overflow-hidden rounded-2xl p-6 text-center sm:p-8">
        <div aria-hidden="true" className={`absolute inset-x-10 top-0 h-px bg-gradient-to-l ${theme.accentBar}`} />
        <span aria-hidden="true" className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 shadow-[0_0_36px_-6px_rgba(129,140,248,0.8)]">
          <Icon className={`h-8 w-8 ${theme.iconText}`} aria-hidden="true" />
        </span>
        <div className="mt-3 flex justify-center"><AdBadge content={content} /></div>
        <h2 className="mt-2 font-display text-xl font-extrabold"><span className="text-gradient">{content.title}</span></h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-foreground-muted">{content.body}</p>
        <div className="mx-auto mt-5 flex max-w-sm flex-col gap-2">
          <AdCta content={content} className="btn-primary w-full !shadow-none" />
          <button type="button" onClick={onClose} className="h-10 text-xs font-bold text-foreground-subtle hover:text-foreground">إغلاق النافذة</button>
        </div>
      </div>
      <div className="pe-8"><AdSignature content={content} /></div>
    </div>
  );
}

/* 09 — ترويسة متدرجة بمنحنى */
export function Design09GradientHeader({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="relative overflow-hidden">
      <div className={`relative bg-gradient-to-l ${theme.accentBar} p-6 pb-10 pe-12 sm:p-8 sm:pb-12`}>
        <span className="absolute inset-0 bg-black/20" />
        <div className="relative flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur">
            <Icon className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">{theme.label}</p>
            <h2 className="font-display text-lg font-extrabold text-white">{content.title}</h2>
          </div>
        </div>
        <svg aria-hidden="true" viewBox="0 0 1440 48" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-8 w-full text-[#0e0b22]">
          <path d="M0 48h1440V24C1200 48 960 0 720 18S240 48 0 20v28z" fill="currentColor" />
        </svg>
      </div>
      <div className="bg-[#0e0b22] p-6 pt-2 sm:p-8 sm:pt-2">
        <p className="text-sm leading-7 text-foreground-muted">{content.body}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <AdCta content={content} className="flex-1" />
          <AdGhostButton label="لاحقاً" onClose={onClose} />
        </div>
        <AdSignature content={content} />
      </div>
    </div>
  );
}

/* 10 — أيقونة نابضة مع عدّاد انتباه */
export function Design10PulseIcon({ content, onClose, miniature }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="relative overflow-hidden p-6 text-center sm:p-8">
      <div aria-hidden="true" className={`pointer-events-none absolute left-1/2 top-10 h-40 w-40 -translate-x-1/2 rounded-full blur-3xl ${theme.glow}`} />
      <div className="relative pe-0">
        <div aria-hidden="true" className="relative mx-auto h-24 w-24">
          {!miniature ? (
            <>
              <span className={`absolute inset-0 animate-ping rounded-full opacity-25 ${theme.glow}`} />
              <span className={`absolute inset-2 animate-pulse-soft rounded-full ${theme.glow} opacity-60`} />
            </>
          ) : null}
          <span className={`absolute inset-4 flex items-center justify-center rounded-full border bg-[#0e0b22] ${theme.iconBg}`}>
            <Icon className={`h-8 w-8 ${theme.iconText}`} aria-hidden="true" />
          </span>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 text-[11px] font-bold text-foreground-subtle">
          <BellRing className="h-3.5 w-3.5" aria-hidden="true" /> إشعار عاجل
          <PartyPopper className="h-3.5 w-3.5 text-fuchsia-300" aria-hidden="true" />
        </div>
        <h2 className="mt-2 font-display text-xl font-extrabold text-foreground">{content.title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-foreground-muted">{content.body}</p>
        <div className="mx-auto mt-5 flex max-w-sm flex-col gap-2">
          <AdCta content={content} className="w-full" />
          <button type="button" onClick={onClose} className="h-10 text-xs font-bold text-foreground-subtle hover:text-foreground">تجاهل التنبيه</button>
        </div>
        <div className="mx-auto max-w-sm text-start"><AdSignature content={content} /></div>
      </div>
    </div>
  );
}
