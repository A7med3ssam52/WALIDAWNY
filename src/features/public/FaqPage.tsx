import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, HelpCircle } from 'lucide-react';

import { Breadcrumbs } from '../../components/Breadcrumbs';
import { SeoHead } from '../../components/SeoHead';
import { SEO, SHARED_FAQS, SITE_URL } from '../../lib/seo';

export function FaqPage() {
  const [open, setOpen] = useState<string | null>(SHARED_FAQS[0]?.question ?? null);

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <SeoHead
        title={SEO.faq.title}
        description={SEO.faq.description}
        keywords={SEO.faq.keywords}
        canonicalPath="/faq"
        faqs={SHARED_FAQS}
        breadcrumbs={[{ name: 'الأسئلة الشائعة', url: `${SITE_URL}/faq` }]}
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <Breadcrumbs items={[{ name: 'الأسئلة الشائعة', url: `${SITE_URL}/faq` }]} className="mb-6" />

        <header className="text-center">
          <span className="health-lime-card inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold">
            <HelpCircle className="h-3.5 w-3.5" /> FAQ
          </span>
          <h1 className="mt-3 font-display text-3xl font-extrabold text-foreground sm:text-5xl">الأسئلة الشائعة</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-foreground-muted">
            كل ما تريد معرفته عن منصة وليد عونى — كود WLDN، الدفع، الدعم، والمحتوى. اضغط على أي سؤال لعرض الإجابة.
          </p>
        </header>

        <section className="mt-8 space-y-3">
          {SHARED_FAQS.map((faq) => {
            const isOpen = open === faq.question;
            return (
              <div key={faq.question} className="glass-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : faq.question)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-start sm:p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-strong"
                  aria-expanded={isOpen}
                >
                  <h2 className="font-display text-sm font-bold text-foreground sm:text-base">{faq.question}</h2>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-foreground-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen ? (
                  <div className="border-t border-border-muted bg-surface-muted px-4 pb-4 pt-3 sm:px-5">
                    <p className="text-sm leading-7 text-foreground-muted">{faq.answer}</p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>

        <section className="health-dark-card mt-10 rounded-[20px] p-6 text-center">
          <h2 className="font-display text-lg font-bold">لم تجد إجابتك؟</h2>
          <p className="mt-1 text-sm text-white/80">تواصل عبر واتساب وسنرد خلال دقائق — أو تصفح كيف تبدأ والأسعار.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link to="/how-it-works" className="btn-primary inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-bold">كيف أبدأ؟</Link>
            <Link to="/pricing" className="inline-flex h-11 items-center justify-center rounded-full border border-white/25 px-6 text-sm font-bold text-white hover:border-white/60">الأسعار</Link>
            <Link to="/contact" className="inline-flex h-11 items-center justify-center rounded-full border border-white/25 px-6 text-sm font-bold text-white hover:border-white/60">تواصل</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
