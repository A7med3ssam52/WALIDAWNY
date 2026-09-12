import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';

import { AdSignature } from '../AdSignature';
import type { AdDesignProps } from '../types';
import { VARIANT_THEME } from '../variantTheme';
import { AdBadge, AdCta } from './common';

/* 11 — شريط عد تنازلي للإغلاق التلقائي */
export function Design11Countdown({ content, onClose, miniature }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  const TOTAL = 15;
  const [left, setLeft] = useState(TOTAL);

  useEffect(() => {
    if (miniature) return;
    if (left <= 0) {
      onClose();
      return;
    }
    const t = window.setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left, miniature, onClose]);

  const pct = Math.max(0, (left / TOTAL) * 100);

  return (
    <div dir="rtl" className="relative p-6 pe-12 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <AdBadge content={content} />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-foreground-muted" dir="ltr">
          <Timer className="h-3.5 w-3.5" aria-hidden="true" /> {left}s
        </span>
      </div>
      <div className="mt-4 flex items-start gap-4">
        <span aria-hidden="true" className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${theme.iconBg} ${theme.iconText}`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-lg font-extrabold text-foreground">{content.title}</h2>
          <p className="mt-1.5 text-sm leading-7 text-foreground-muted">{content.body}</p>
        </div>
      </div>
      <div aria-hidden="true" className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className={`h-full rounded-full bg-gradient-to-l ${theme.accentBar} transition-all duration-1000`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <AdCta content={content} className="flex-1" />
        <button type="button" onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-xl border border-white/12 bg-white/5 px-5 text-sm font-bold text-foreground-muted hover:text-foreground">
          إغلاق الآن
        </button>
      </div>
      <AdSignature content={content} />
    </div>
  );
}

/* 12 — احتفالي confetti للنجاح */
export function Design12Celebration({ content, onClose, miniature }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  const pieces = miniature ? [] : Array.from({ length: 18 }, (_, i) => i);
  const colors = ['bg-emerald-400', 'bg-sky-400', 'bg-amber-300', 'bg-fuchsia-400', 'bg-indigo-400'];
  return (
    <div dir="rtl" className="relative overflow-hidden p-6 text-center sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((i) => (
          <span
            key={i}
            className={`particle ${colors[i % colors.length]}`}
            style={{
              left: `${(i * 53) % 100}%`,
              top: `${(i * 29) % 60}%`,
              width: 6 + (i % 3) * 3,
              height: 6 + (i % 2) * 4,
              borderRadius: i % 2 === 0 ? 999 : 2,
              animationDelay: `${(i % 6) * 0.7}s`,
            }}
          />
        ))}
      </div>
      <div className="relative">
        <span aria-hidden="true" className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border ${theme.iconBg} shadow-[0_0_40px_-8px_rgba(52,211,153,0.8)]`}>
          <Icon className={`h-8 w-8 ${theme.iconText}`} aria-hidden="true" />
        </span>
        <p className="mt-3 text-xs font-extrabold tracking-widest text-emerald-300">🎉 تهانينا!</p>
        <h2 className="mt-1 font-display text-xl font-extrabold text-foreground">{content.title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-foreground-muted">{content.body}</p>
        <div className="mx-auto mt-5 flex max-w-sm flex-col gap-2">
          <AdCta content={content} className="w-full" />
          <button type="button" onClick={onClose} className="h-10 text-xs font-bold text-foreground-subtle hover:text-foreground">احتفال لاحقاً</button>
        </div>
        <div className="mx-auto max-w-sm text-start"><AdSignature content={content} /></div>
      </div>
    </div>
  );
}

/* 13 — خطر مخطط بحافة تحذيرية */
export function Design13DangerStriped({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="relative">
      <div
        aria-hidden="true"
        className="h-2.5 w-full"
        style={{
          backgroundImage: 'repeating-linear-gradient(-45deg, #fb7185 0 12px, #0e0b22 12px 24px)',
        }}
      />
      <div className="border-x-2 border-b-2 border-rose-500/30 bg-rose-500/5 p-6 pe-12 sm:p-8">
        <div className="glass-tile-error flex items-start gap-3 rounded-2xl p-4">
          <span aria-hidden="true" className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${theme.iconBg} ${theme.iconText}`}>
            <Icon className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[11px] font-extrabold tracking-widest text-rose-300">تنبيه عالي الأهمية</p>
            <h2 className="mt-0.5 font-display text-lg font-extrabold text-foreground">{content.title}</h2>
          </div>
        </div>
        <p className="mt-3 text-sm leading-7 text-foreground-muted">{content.body}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <AdCta content={content} className="flex-1" />
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-500/10 px-5 text-sm font-bold text-rose-200 hover:bg-rose-500/20">
            فهمت التحذير
          </button>
        </div>
        <AdSignature content={content} />
      </div>
    </div>
  );
}

/* 14 — تحذير متوهج بإطار مضيء */
export function Design14WarningGlow({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="relative p-5 sm:p-7">
      <div className="relative rounded-2xl border border-amber-400/30 bg-amber-500/8 p-6 text-center shadow-[0_0_60px_-12px_rgba(251,191,36,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] sm:p-8">
        <div aria-hidden="true" className="absolute inset-x-12 top-0 h-px bg-gradient-to-l from-transparent via-amber-300/70 to-transparent" />
        <span aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/15 text-amber-300 shadow-[0_0_30px_-6px_rgba(251,191,36,0.7)]">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </span>
        <div className="mt-3 flex justify-center"><AdBadge content={content} /></div>
        <h2 className="mt-2 font-display text-lg font-extrabold text-foreground">{content.title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-foreground-muted">{content.body}</p>
        <div className="mx-auto mt-5 flex max-w-sm flex-col gap-2">
          <AdCta content={content} className="w-full" />
          <button type="button" onClick={onClose} className="h-10 text-xs font-bold text-foreground-subtle hover:text-foreground">سأراجع لاحقاً</button>
        </div>
      </div>
      <div className="pe-8 pt-1"><AdSignature content={content} /></div>
    </div>
  );
}

/* 15 — معلومات زجاجية هادئة */
export function Design15InfoGlass({ content, onClose }: AdDesignProps) {
  const theme = VARIANT_THEME[content.variant];
  const Icon = theme.Icon;
  return (
    <div dir="rtl" className="relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-sky-500/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-indigo-500/15 blur-3xl" />
      <div className="relative p-6 pe-12 sm:p-8">
        <div className="glass-soft flex items-center gap-4 rounded-2xl p-4">
          <span aria-hidden="true" className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${theme.iconBg} ${theme.iconText}`}>
            <Icon className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-sky-300">معلومة تهمك</p>
            <h2 className="truncate font-display text-base font-extrabold text-foreground">{content.title}</h2>
          </div>
        </div>
        <p className="mt-4 text-sm leading-8 text-foreground-muted">{content.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <AdCta content={content} className="flex-1" />
          <button type="button" onClick={onClose} aria-label="إغلاق" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-foreground-muted hover:text-foreground">✕</button>
        </div>
        <AdSignature content={content} />
      </div>
    </div>
  );
}
