import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle, Tag } from 'lucide-react';

import { Breadcrumbs } from '../../components/Breadcrumbs';
import { SeoHead } from '../../components/SeoHead';
import { getPublicUnitPrices } from '../../data/rpc';
import { getCourseJsonLd, SEO, SITE_URL } from '../../lib/seo';
import { formatPrice } from '../../lib/format';
import type { PublicUnitPrice } from '../../types/database';

export function PricingPublicPage() {
  const [prices, setPrices] = useState<PublicUnitPrice[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    void getPublicUnitPrices()
      .then((d) => {
        setPrices(d);
        setError(false);
      })
      .catch(() => {
        setError(true);
        setPrices([]);
      });
  }, []);

  const grouped = useMemo(() => {
    if (!prices) return null;
    const map = new Map<string, PublicUnitPrice[]>();
    for (const p of prices) {
      const key = p.grade_name ?? 'غير مصنف';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'));
  }, [prices]);

  const courseJsonLd = useMemo(() => {
    if (!prices) return [];
    return prices.slice(0, 10).map((p) =>
      getCourseJsonLd({
        name: `${p.grade_name ?? ''} — ${p.unit_name}`.trim(),
        description: `وحدة ${p.unit_name} لطلاب ${p.grade_name ?? ''} — متاحة مدى الحياة بكود WLDN.`,
        url: `${SITE_URL}/pricing`,
        price: p.total_price,
      }),
    );
  }, [prices]);

  return (
    <div className="min-h-screen" dir="rtl">
      <SeoHead
        title={SEO.pricing.title}
        description={SEO.pricing.description}
        keywords={SEO.pricing.keywords}
        canonicalPath="/pricing"
        breadcrumbs={[{ name: 'الأسعار', url: `${SITE_URL}/pricing` }]}
        extraJsonLd={courseJsonLd as unknown as Record<string, unknown>[]}
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <Breadcrumbs items={[{ name: 'الأسعار', url: `${SITE_URL}/pricing` }]} className="mb-6" />

        <header className="text-center">
          <span className="glass-soft inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold text-indigo-300">
            <Tag className="h-3.5 w-3.5" /> شراء دائم WLDN
          </span>
          <h1 className="mt-3 font-display text-3xl font-extrabold sm:text-5xl"><span className="text-gradient">أسعار الوحدات</span></h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-foreground-muted">
            اشترِ الوحدة مرة واحدة وافتحها مدى الحياة — أو فعّل بكود WLDN من الأستاذ. الأسعار تشمل رسوم المنصة وضمان وصول دائم للمحتوى بعد التفعيل.
          </p>
        </header>

        <section className="glass-card mt-8 p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold text-foreground">كيف يعمل التسعير؟</h2>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-foreground-muted sm:grid-cols-2">
            <li className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-emerald-300" /> سعر الوحدة = سعر أساسي + رسوم منصة ثابتة</li>
            <li className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-emerald-300" /> كود WLDN-XXXX يفتح الوحدة للأبد بدون تجديد</li>
            <li className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-emerald-300" /> تواصل واتساب للحصول على الكود بعد الدفع</li>
            <li className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-emerald-300" /> مشاهدة غير محدودة للفيديو والملازم والسبورات</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/how-it-works" className="text-sm font-bold text-indigo-300 hover:text-indigo-200">كيف أفعّل الكود؟ ←</Link>
            <Link to="/faq" className="text-sm font-bold text-foreground-muted hover:text-foreground">الأسئلة الشائعة ←</Link>
          </div>
        </section>

        {error ? (
          <div className="mt-8 rounded-xl border border-error/25 bg-error/10 p-6 text-center text-sm text-error">
            تعذر تحميل الأسعار — حاول تحديث الصفحة أو تواصل عبر واتساب.
          </div>
        ) : prices === null ? (
          <p className="mt-8 text-center text-sm text-foreground-muted">جاري تحميل الأسعار...</p>
        ) : grouped && grouped.length > 0 ? (
          <div className="mt-8 space-y-8">
            {grouped.map(([gradeName, units]) => (
              <section key={gradeName}>
                <h2 className="font-display text-xl font-bold text-foreground">{gradeName}</h2>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {units.map((u) => (
                    <div key={u.unit_id} className="glass-card conic-ring spotlight-card p-5">
                      <BookOpen className="h-5 w-5 text-indigo-300" />
                      <h3 className="mt-2 font-display text-sm font-bold text-foreground">{u.unit_name}</h3>
                      <p className="mt-1 text-xs text-foreground-subtle">{gradeName}</p>
                      <p className="mt-2 font-display text-2xl font-extrabold text-gradient" dir="ltr">
                        {formatPrice(u.total_price)} <span className="text-sm">ج.م</span>
                      </p>
                      <p className="text-xs text-foreground-subtle">
                        أساسي {formatPrice(u.base_price)} + رسوم {formatPrice(u.platform_fee)}
                      </p>
                      <Link to="/faq#codes" className="mt-3 inline-flex text-xs font-bold text-indigo-300 hover:text-indigo-200">تفاصيل التفعيل ←</Link>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className="mt-8 text-center text-sm text-foreground-muted">لا توجد وحدات منشورة حالياً — تواصل عبر واتساب لمعرفة المتاح.</p>
        )}

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-display text-lg font-bold text-foreground">أسئلة سريعة عن الأسعار</h2>
          <ul className="mt-3 space-y-3 text-sm leading-6 text-foreground-muted">
            <li><strong className="text-foreground">هل السعر نهائي؟</strong> نعم، السعر المعروض هو الإجمالي شامل رسوم المنصة — لا مصاريف مخفية.</li>
            <li><strong className="text-foreground">هل يمكن شراء أكثر من وحدة؟</strong> نعم، كل وحدة بكود منفصل WLDN-XXXX وكلها مدى الحياة.</li>
            <li><strong className="text-foreground">ماذا بعد الدفع؟</strong> يصلك كود WLDN عبر واتساب، تفعله في لوحة الطالب وتشاهد فوراً.</li>
          </ul>
          <Link to="/faq" className="mt-4 inline-block text-sm font-bold text-indigo-300">كل الأسئلة ←</Link>
        </section>
      </div>
    </div>
  );
}
