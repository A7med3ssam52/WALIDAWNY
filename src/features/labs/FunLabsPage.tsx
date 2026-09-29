import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, FlaskConical, PartyPopper } from 'lucide-react';

import { SeoHead } from '../../components/SeoHead';
import { LAB_FUN_VARIANTS } from './fun/funLabsData';
import { Fun1 } from './fun/variant1';
import { Fun2 } from './fun/variant2';
import { Fun3 } from './fun/variant3';
import { Fun4 } from './fun/variant4';
import { Fun5 } from './fun/variant5';

/**
 * /labs/fun — student engagement showroom (no backend, no persistence, noindex).
 * Five gentle engagement concepts (no luck mechanics, no harsh pressure)
 * on identical mock content for side-by-side comparison.
 */

type VariantFilter = 'all' | '1' | '2' | '3' | '4' | '5';

const FILTERS: Array<{ id: VariantFilter; label: string }> = [
  { id: 'all', label: 'عرض الخمسة' },
  { id: '1', label: '1 · غرف' },
  { id: '2', label: '2 · سؤال اليوم' },
  { id: '3', label: '3 · سلسلة' },
  { id: '4', label: '4 · تحدي' },
  { id: '5', label: '5 · شارات' },
];

const VARIANT_COMPONENTS: Record<string, () => React.JSX.Element> = {
  '1': Fun1,
  '2': Fun2,
  '3': Fun3,
  '4': Fun4,
  '5': Fun5,
};

export function FunLabsPage() {
  const [filter, setFilter] = useState<VariantFilter>('all');
  const show = (id: string) => filter === 'all' || filter === id;

  return (
    <div dir="rtl" data-testid="labs-fun" className="min-h-screen bg-background text-foreground">
      <SeoHead
        title="معمل تسلية الطلاب | وليد عونى"
        description="خمسة اقتراحات لعناصر مسلية تشجع الطلاب على قضاء وقت أطول في المنصة — عرض تجريبي بدون بيانات حقيقية"
        canonicalPath="/labs/fun"
        noIndex
      />
      <a
        href="#fun-main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-surface-muted focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-foreground"
      >
        تخطَّ إلى المحتوى
      </a>

      <div className="border-b border-border bg-surface-muted">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-2 sm:px-6">
          <Link to="/" className="flex h-11 items-center gap-1 text-sm font-bold text-foreground-muted transition-colors hover:text-foreground sm:h-10">
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
            الرئيسية
          </Link>
          <span className="flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-black text-warning">
            <FlaskConical aria-hidden="true" className="h-3.5 w-3.5" />
            وضع تجريبي — لا تُحفظ أي بيانات
          </span>
        </div>
      </div>

      <main id="fun-main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong">
            <PartyPopper className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-black text-foreground sm:text-3xl">تسلية الطلاب — 5 اقتراحات</h1>
            <p className="mt-1 text-sm leading-6 text-foreground-muted">
              أفكار لطيفة تخلي الطلاب يقعدوا وقت أطول: بدون حظ، بدون ضغط نفسي، وبدون شات مفتوح — قارن واختار.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-border bg-surface p-4 sm:p-5">
          <p id="fun-filter-label" className="text-xs font-black text-foreground-subtle">الاتجاه المعروض</p>
          <div role="group" aria-labelledby="fun-filter-label" className="mt-2 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                data-testid={`fun-show-${f.id}`}
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

        <div className="mt-8 flex flex-col gap-10">
          {LAB_FUN_VARIANTS.filter((v) => show(v.id)).map((meta) => {
            const Variant = VARIANT_COMPONENTS[meta.id];
            return (
              <section key={meta.id} data-testid={`fun-variant-section-${meta.id}`} aria-label={meta.name} className="scroll-mt-6">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary font-display text-sm font-black text-primary-foreground">
                    {meta.id}
                  </span>
                  {meta.id === '1' ? (
                    <span data-testid="fun-selected-badge" className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[11px] font-black text-success">
                      <Check aria-hidden="true" className="h-3 w-3" />
                      مُرشح للتعميم
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-extrabold text-foreground">{meta.name}</h2>
                    <p className="mt-0.5 text-xs leading-5 text-foreground-muted">{meta.tagline}</p>
                  </div>
                </div>
                <ul className="mb-3 flex flex-wrap gap-1.5" aria-label={`سمات ${meta.name}`}>
                  {meta.traits.map((trait) => (
                    <li key={trait} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-foreground-muted">
                      <Check aria-hidden="true" className="h-3 w-3 text-primary-strong" />
                      {trait}
                    </li>
                  ))}
                </ul>
                <div className="rounded-[20px] border border-border bg-surface-muted/40 p-3 sm:p-4">
                  <Variant />
                </div>
                <p className="mt-2 text-xs leading-5 text-foreground-subtle">الأنسب: {meta.bestFor}</p>
              </section>
            );
          })}
        </div>

        <p className="mt-10 rounded-2xl border border-border bg-surface p-4 text-center text-sm leading-7 text-foreground-muted">
          عاين على الموبايل والديسكتوب — وبعد اختيارك سنبني الاتجاه الفائز بقاعدة بيانات حقيقية (غرف بإشراف الأستاذ، حضور فقط بدون شات مفتوح).
        </p>
      </main>
    </div>
  );
}
