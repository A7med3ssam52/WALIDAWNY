import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, FlaskConical, LayoutGrid } from 'lucide-react';

import { SeoHead } from '../../components/SeoHead';
import { THEME_PALETTES } from '../../theme/ThemeContext';
import { NEWUI_VARIANTS } from './newui/newUiData';
import { NewUiADashboard } from './newui/variantA';
import { NewUiBDashboard } from './newui/variantB';
import { NewUiCDashboard } from './newui/variantC';

/**
 * /labs/newui — isolated cards-system showroom (no backend, no persistence, noindex).
 * Compares three candidate card languages (A/B/C) on identical mock dashboards.
 * Theme switching is local (data-theme on the wrapper) so the global theme is untouched.
 */

type VariantFilter = 'all' | 'a' | 'b' | 'c';

const FILTERS: Array<{ id: VariantFilter; label: string }> = [
  { id: 'all', label: 'عرض الكل' },
  { id: 'a', label: 'الاتجاه A' },
  { id: 'b', label: 'الاتجاه B' },
  { id: 'c', label: 'الاتجاه C' },
];

function VariantSection({
  id,
  index,
  children,
}: {
  id: 'a' | 'b' | 'c';
  index: number;
  children: React.ReactNode;
}) {
  const meta = NEWUI_VARIANTS[index];
  return (
    <section
      data-testid={`newui-variant-section-${id}`}
      id={`newui-section-${id}`}
      aria-label={meta.name}
      className="scroll-mt-6"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary font-display text-sm font-black text-primary-foreground"
        >
          {meta.id.toUpperCase()}
        </span>
        {id === 'b' ? (
          <span
            data-testid="newui-selected-badge"
            className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[11px] font-black text-success"
          >
            <Check aria-hidden="true" className="h-3 w-3" />
            مُختار للتعميم
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-extrabold text-foreground">{meta.name}</h2>
          <p className="mt-0.5 text-xs leading-5 text-foreground-muted">{meta.tagline}</p>
        </div>
      </div>
      <ul className="mb-3 flex flex-wrap gap-1.5" aria-label={`سمات ${meta.name}`}>
        {meta.traits.map((trait) => (
          <li
            key={trait}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-foreground-muted"
          >
            <Check aria-hidden="true" className="h-3 w-3 text-primary-strong" />
            {trait}
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}

export function NewUiPage() {
  const [filter, setFilter] = useState<VariantFilter>('all');
  const [themeId, setThemeId] = useState<string>('midnight');
  const show = (id: 'a' | 'b' | 'c') => filter === 'all' || filter === id;

  return (
    <div
      dir="rtl"
      data-testid="labs-newui"
      data-theme={themeId}
      className="min-h-screen bg-background text-foreground"
    >
      <SeoHead
        title="معمل نظام الكروت الجديد | وليد عونى"
        description="صفحة تجريبية معزولة لمقارنة ثلاثة اتجاهات لنظام الكروت في لوحات التحكم — بدون بيانات حقيقية."
        canonicalPath="/labs/newui"
        noIndex
      />
      <a
        href="#newui-main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-surface-muted focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-foreground"
      >
        تخطَّ إلى المحتوى
      </a>

      {/* Labs badge bar */}
      <div className="border-b border-border bg-surface-muted">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-2 sm:px-6">
          <Link
            to="/"
            className="flex h-11 items-center gap-1 text-sm font-bold text-foreground-muted transition-colors hover:text-foreground sm:h-10"
          >
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
            الرئيسية
          </Link>
          <span className="flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-black text-warning">
            <FlaskConical aria-hidden="true" className="h-3.5 w-3.5" />
            وضع تجريبي — لا تُحفظ أي بيانات
          </span>
        </div>
      </div>

      <main id="newui-main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong"
          >
            <LayoutGrid className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-black text-foreground sm:text-3xl">
              نظام الكروت الجديد
            </h1>
            <p className="mt-1 text-sm leading-6 text-foreground-muted">
              ثلاثة اتجاهات على نفس البيانات التجريبية — بدّل الثيم من الأسفل لمعاينة كل اتجاه على
              الثيمات الستة، ثم اختر اتجاهًا واحدًا لنعممه على كل لوحات التحكم.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-col gap-2">
            <p id="newui-filter-label" className="text-xs font-black text-foreground-subtle">
              الاتجاه المعروض
            </p>
            <div role="group" aria-labelledby="newui-filter-label" className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  data-testid={`newui-show-${f.id}`}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`rounded-xl border px-4 py-2 text-sm font-bold transition-colors ${
                    filter === f.id
                      ? 'border-transparent bg-primary text-primary-foreground'
                      : 'border-border bg-surface-muted text-foreground-muted hover:text-foreground'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t border-border-muted pt-4">
            <p id="newui-theme-label" className="text-xs font-black text-foreground-subtle">
              المعاينة على ثيم: {THEME_PALETTES.find((p) => p.id === themeId)?.name}
            </p>
            <div role="group" aria-labelledby="newui-theme-label" className="flex flex-wrap gap-2">
              {THEME_PALETTES.map((palette) => (
                <button
                  key={palette.id}
                  type="button"
                  data-testid={`newui-theme-${palette.id}`}
                  aria-pressed={themeId === palette.id}
                  onClick={() => setThemeId(palette.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                    themeId === palette.id
                      ? 'border-primary-strong bg-primary-soft text-foreground'
                      : 'border-border bg-surface-muted text-foreground-muted hover:text-foreground'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 rounded-full border border-border"
                    style={{ backgroundColor: palette.swatch }}
                  />
                  {palette.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Showroom */}
        <div className="mt-8 flex flex-col gap-10">
          {show('a') ? (
            <VariantSection id="a" index={0}>
              <NewUiADashboard />
            </VariantSection>
          ) : null}
          {show('b') ? (
            <VariantSection id="b" index={1}>
              <NewUiBDashboard />
            </VariantSection>
          ) : null}
          {show('c') ? (
            <VariantSection id="c" index={2}>
              <NewUiCDashboard />
            </VariantSection>
          ) : null}
        </div>

        <p className="mt-10 rounded-2xl border border-border bg-surface p-4 text-center text-sm leading-7 text-foreground-muted">
          عاين الاتجاهات على الموبايل والديسكتوب — وبعد اختيارك (A أو B أو C) سنعمم النظام الفائز
          على كل لوحات التحكم بنفس الـ APIs الحالية بدون كسر أي صفحة.
        </p>
      </main>
    </div>
  );
}
