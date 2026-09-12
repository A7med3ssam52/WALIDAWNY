import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye, Megaphone, PenLine } from 'lucide-react';

import { BrandIcon } from '../../components/BrandIcon';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { SeoHead } from '../../components/SeoHead';
import { Textarea } from '../../components/Textarea';
import { Toggle } from '../../components/Toggle';
import {
  AD_DESIGNS,
  AdModalShell,
  DEFAULT_AD_CONTENT,
  VARIANT_LABELS,
  getAdDesign,
  type AdContent,
  type AdVariant,
} from '../../components/ads';

const VARIANTS: AdVariant[] = ['info', 'success', 'warning', 'error'];

const VARIANT_DOT: Record<AdVariant, string> = {
  info: 'bg-sky-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error: 'bg-rose-400',
};

const PLACEMENT_LABEL: Record<string, string> = {
  center: 'وسط',
  top: 'علوي',
  bottom: 'سفلي',
  side: 'جانبي',
  fullscreen: 'ملء الشاشة',
};

/**
 * صفحة preview/ads — معرض الـ20 تصميم لظهور الإعلانات داخل Modal احترافي.
 * - تحكم حي في النوع (نجاح/خطأ/تحذير/معلومات) والمحتوى والتوقيع
 * - كل بطاقة تعرض مصغّراً حياً للتصميم + زر فتحه في Modal حقيقي
 * - عامة (public) وnoindex — للمعاينة الداخلية فقط
 */
export function AnnouncementsPreviewPage() {
  const [variant, setVariant] = useState<AdVariant>('info');
  const [title, setTitle] = useState(DEFAULT_AD_CONTENT.title);
  const [body, setBody] = useState(DEFAULT_AD_CONTENT.body);
  const [linkLabel, setLinkLabel] = useState(DEFAULT_AD_CONTENT.link_label ?? '');
  const [linkUrl, setLinkUrl] = useState(DEFAULT_AD_CONTENT.link_url ?? '');
  const [showSignature, setShowSignature] = useState(true);
  const [signatureName, setSignatureName] = useState(DEFAULT_AD_CONTENT.signatureName ?? '');
  const [signatureTitle, setSignatureTitle] = useState(DEFAULT_AD_CONTENT.signatureTitle ?? '');
  const [activeId, setActiveId] = useState<string | null>(null);

  const content: AdContent = useMemo(
    () => ({
      title: title.trim() || DEFAULT_AD_CONTENT.title,
      body: body.trim() || DEFAULT_AD_CONTENT.body,
      link_url: linkUrl.trim() || null,
      link_label: linkLabel.trim() || null,
      variant,
      showSignature,
      signatureName: signatureName.trim() || DEFAULT_AD_CONTENT.signatureName,
      signatureTitle: signatureTitle.trim() || DEFAULT_AD_CONTENT.signatureTitle,
    }),
    [title, body, linkUrl, linkLabel, variant, showSignature, signatureName, signatureTitle],
  );

  const active = activeId ? getAdDesign(activeId) : undefined;
  const ActiveComponent = active?.component;

  return (
    <div dir="rtl" className="min-h-screen">
      <SeoHead
        title="معاينة تصاميم الإعلانات — 20 Modal احترافي"
        description="معرض داخلي لمعاينة 20 تصميم مختلف لظهور الإعلانات داخل Modal احترافي بأنواع النجاح والخطأ والتحذير والمعلومات مع التوقيع الرسمي."
        canonicalPath="/preview/ads"
        noIndex
      />

      {/* ترويسة بسيطة */}
      <header className="glass-nav sticky top-0 z-40">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
            <BrandIcon className="h-8 w-8" />
            <span className="font-display text-sm font-bold text-foreground">وليد عونى</span>
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground-muted hover:text-foreground">
            <ArrowRight className="h-4 w-4" aria-hidden="true" /> عودة للرئيسية
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        {/* عنوان */}
        <div className="rise text-center">
          <span className="glass-soft inline-flex items-center gap-2 rounded-full border-primary/30 px-4 py-1.5 text-xs font-bold text-indigo-300">
            <Megaphone className="h-3.5 w-3.5" aria-hidden="true" /> preview / ads — معاينة داخلية
          </span>
          <h1 className="mx-auto mt-4 max-w-2xl font-display text-2xl font-extrabold leading-snug text-foreground sm:text-4xl">
            20 تصميماً لظهور <span className="text-gradient">الإعلانات في Modal</span> احترافي
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-foreground-muted">
            جرّب كل تصميم بأنواعه الأربعة (نجاح / خطأ / تحذير / معلومات)، وعدّل المحتوى والتوقيع لحظياً،
            ثم افتح أي تصميم في Modal حقيقي بنفس سلوك الإنتاج (فخ الفوكس + Escape + قفل السكرول).
          </p>
        </div>

        {/* لوحة التحكم */}
        <Card
          title="لوحة التحكم الحية"
          subtitle="كل تعديل هنا ينعكس فوراً على المصغّرات الـ20 وعلى الـModal المفتوح"
          className="rise mt-8"
        >
          <div className="flex flex-wrap gap-2" role="group" aria-label="نوع الإعلان">
            {VARIANTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVariant(v)}
                aria-pressed={variant === v}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                  variant === v
                    ? 'border-primary/50 bg-primary-soft text-foreground shadow-[0_0_20px_-8px_rgba(129,140,248,0.6)]'
                    : 'border-white/10 bg-white/4 text-foreground-muted hover:bg-white/8 hover:text-foreground'
                }`}
              >
                <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${VARIANT_DOT[v]}`} />
                {VARIANT_LABELS[v]}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Input label="عنوان الإعلان" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="نص الزر" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="عرض التفاصيل" />
              <Input label="رابط الزر" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" dir="ltr" />
            </div>
          </div>
          <div className="mt-4">
            <Textarea label="نص الإعلان" value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
          </div>

          {/* التوقيع */}
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
                <PenLine className="h-4 w-4 text-indigo-300" aria-hidden="true" /> التوقيع الرسمي أسفل الإعلان
              </span>
              <Toggle name="showSignature" label={showSignature ? 'التوقيع ظاهر' : 'التوقيع مخفي'} checked={showSignature} onChange={setShowSignature} />
            </div>
            {showSignature ? (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Input label="اسم الموقّع" value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="إدارة منصة وليد عوني" />
                <Input label="صفة الموقّع" value={signatureTitle} onChange={(e) => setSignatureTitle(e.target.value)} placeholder="التوقيع الرسمي للإدارة" />
              </div>
            ) : (
              <p className="mt-2 text-xs text-foreground-subtle">التوقيع مخفي حالياً — فعّله لمعاينة شكله في كل التصاميم.</p>
            )}
          </div>
        </Card>

        {/* الشبكة */}
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="ads-designs-grid">
          {AD_DESIGNS.map((design) => {
            const Preview = design.component;
            return (
              <article
                key={design.id}
                aria-labelledby={`ad-design-title-${design.id}`}
                className="glass-card glass-card-hover spotlight-card rise relative flex flex-col overflow-hidden"
                data-testid={`ad-design-card-${design.id}`}
              >
                <div className="flex items-start justify-between gap-3 p-4 pb-0 sm:p-5 sm:pb-0">
                  <div className="flex items-start gap-3">
                    <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 font-display text-sm font-extrabold text-white shadow-[0_8px_20px_-8px_rgba(124,58,237,0.8)]">
                      {String(design.number).padStart(2, '0')}
                    </span>
                    <div>
                      <h2 id={`ad-design-title-${design.id}`} className="font-display text-base font-bold text-foreground">
                        {design.name}
                      </h2>
                      <p className="mt-0.5 text-xs leading-5 text-foreground-subtle">{design.description}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 sm:px-5">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-bold text-foreground-muted">
                    الموضع: {PLACEMENT_LABEL[design.placement] ?? design.placement}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-bold text-foreground-muted">
                    الحجم: {design.size}
                  </span>
                  <span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-bold text-indigo-200">
                    {design.bestFor}
                  </span>
                </div>

                {/* مصغّر حي */}
                <div className="m-4 mb-0 overflow-hidden rounded-2xl border border-white/10 bg-black/25 sm:m-5 sm:mb-0">
                  <div className="pointer-events-none max-h-72 overflow-hidden select-none" aria-hidden="true" data-testid={`ad-design-mini-${design.id}`}>
                    <Preview content={content} onClose={() => undefined} miniature />
                  </div>
                </div>

                <div className="flex items-center gap-2 p-4 sm:p-5">
                  <Button variant="primary" size="sm" className="flex-1" icon={<Eye className="h-4 w-4" />} onClick={() => setActiveId(design.id)}>
                    عرض في Modal
                  </Button>
                  <span className="hidden text-[11px] text-foreground-subtle sm:inline">نفس سلوك الإنتاج</span>
                </div>
              </article>
            );
          })}
        </div>

        {/* دليل الاستخدام */}
        <Card title="كيف تستخدم تصميماً في الإنتاج؟" subtitle="انسخ هذا النمط داخل AnnouncementBanner أو أي صفحة إعلانات" className="mt-8">
          <ol className="list-decimal space-y-2 ps-5 text-sm leading-7 text-foreground-muted">
            <li>اختر رقم التصميم من الأعلى (1–20) والنوع (نجاح / خطأ / تحذير / معلومات).</li>
            <li>استخدم <code dir="ltr" className="rounded bg-white/8 px-1.5 py-0.5 text-xs text-indigo-200">AdModalShell + AD_DESIGNS</code> لعرض إعلان Supabase داخل Modal.</li>
            <li>التوقيع يظهر تلقائياً من <code dir="ltr" className="rounded bg-white/8 px-1.5 py-0.5 text-xs text-indigo-200">signatureName / signatureTitle</code> — أخفه عبر <code dir="ltr" className="rounded bg-white/8 px-1.5 py-0.5 text-xs text-indigo-200">showSignature=false</code>.</li>
          </ol>
          <pre dir="ltr" className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-left text-xs leading-6 text-indigo-100">
{`import { AdModalShell, getAdDesign } from '@/components/ads';

const design = getAdDesign('official-letter'); // 01..20
const Design = design!.component;

<AdModalShell open={!!ad} onClose={dismiss} label={ad.title}
  placement={design!.placement} size={design!.size}>
  {ad && <Design content={{
    title: ad.title, body: ad.body,
    link_url: ad.link_url, link_label: ad.link_label,
    variant: ad.variant, showSignature: true,
    signatureName: 'إدارة منصة وليد عوني',
    signatureTitle: 'التوقيع الرسمي للإدارة',
  }} onClose={dismiss} />}
</AdModalShell>`}
          </pre>
        </Card>

        <footer className="mt-8 border-t border-white/8 pt-6 text-center">
          <p className="text-xs text-foreground-subtle">صفحة معاينة داخلية — لا تُفهرس في محركات البحث (noindex).</p>
          {showSignature ? (
            <p className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-foreground-muted">
              <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
              التوقيع المعتمد: {content.signatureName} — {content.signatureTitle}
            </p>
          ) : (
            <p className="mt-2 text-xs text-foreground-subtle">التوقيع مخفي حالياً — فعّله من لوحة التحكم لاعتماده.</p>
          )}
        </footer>
      </main>

      {/* الـModal الحي */}
      {active && ActiveComponent ? (
        <AdModalShell
          open={activeId !== null}
          onClose={() => setActiveId(null)}
          placement={active.placement}
          size={active.size}
          label={`${active.number}. ${active.name} — ${content.title}`}
          testId={`ad-modal-${active.id}`}
        >
          <ActiveComponent content={content} onClose={() => setActiveId(null)} />
        </AdModalShell>
      ) : null}
    </div>
  );
}
