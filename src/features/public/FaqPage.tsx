import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, HelpCircle } from 'lucide-react';

import { Breadcrumbs } from '../../components/Breadcrumbs';
import { SeoHead } from '../../components/SeoHead';
import { SEO, SHARED_FAQS, SITE_URL } from '../../lib/seo';

export function FaqPage() {
  const [open, setOpen] = useState<string | null>(SHARED_FAQS[0]?.question ?? null);

  return (
    <div className="min-h-screen" dir="rtl">
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
          <span className="glass-soft inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold text-indigo-300">
            <HelpCircle className="h-3.5 w-3.5" /> FAQ
          </span>
          <h1 className="mt-3 font-display text-3xl font-extrabold sm:text-5xl"><span className="text-gradient">الأسئلة الشائعة</span></h1>
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
                  className="flex w-full items-center justify-between gap-3 p-4 text-start sm:p-5"
                  aria-expanded={isOpen}
                >
                  <h2 className="font-display text-sm font-bold text-foreground sm:text-base">{faq.question}</h2>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-foreground-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen ? (
                  <div className="border-t border-white/8 px-4 pb-4 pt-3 sm:px-5">
                    <p className="text-sm leading-7 text-foreground-muted">{faq.answer}</p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <h2 className="font-display text-lg font-bold text-foreground">لم تجد إجابتك؟</h2>
          <p className="mt-1 text-sm text-foreground-muted">تواصل عبر واتساب وسنرد خلال دقائق — أو تصفح كيف تبدأ والأسعار.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link to="/how-it-works" className="btn-primary inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-white">كيف أبدأ؟</Link>
            <Link to="/pricing" className="glass-soft inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-foreground">الأسعار</Link>
            <Link to="/contact" className="glass-soft inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-foreground">تواصل</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
