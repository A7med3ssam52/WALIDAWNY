import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, GraduationCap, ArrowLeft } from 'lucide-react';

import { Breadcrumbs } from '../../components/Breadcrumbs';
import { SeoHead } from '../../components/SeoHead';
import { getPublicUnitPrices } from '../../data/rpc';
import { SEO, SITE_URL } from '../../lib/seo';
import type { PublicUnitPrice } from '../../types/database';

const STATIC_GRADES = [
  { slug: 'first-prep', name: 'الصف الأول الإعدادي', desc: 'منهج مبسط لتأسيس قوي في كل المواد مع وحدات مدى الحياة.' },
  { slug: 'second-prep', name: 'الصف الثاني الإعدادي', desc: 'شرح منظم يغطي المنهج المصري كاملاً مع ملازم PDF وسبورات.' },
  { slug: 'third-prep', name: 'الصف الثالث الإعدادي', desc: 'أهم سنة مصيرية — شرح مركز، مراجعات، وفيديوهات عالية الجودة.' },
  { slug: 'first-secondary', name: 'الصف الأول الثانوي', desc: 'تأسيس ثانوي قوي — مناهج منظمة وتقدم متابع لحظياً.' },
  { slug: 'second-secondary', name: 'الصف الثاني الثانوي', desc: 'منهج ثانوي متقدم مع دعم واتساب وتفعيل فوري بكود WLDN.' },
  { slug: 'third-secondary', name: 'الصف الثالث الثانوي', desc: 'المرحلة الحاسمة — وحدات شاملة وشرح يؤهلك للتفوق.' },
];

export function SubjectsPage() {
  const [prices, setPrices] = useState<PublicUnitPrice[] | null>(null);

  useEffect(() => {
    void getPublicUnitPrices()
      .then(setPrices)
      .catch(() => setPrices([]));
  }, []);

  // Count units per grade name (teaser only — no lesson titles)
  const countByGrade: Record<string, number> = {};
  if (prices) {
    for (const p of prices) {
      const g = p.grade_name ?? 'غير مصنف';
      countByGrade[g] = (countByGrade[g] ?? 0) + 1;
    }
  }

  return (
    <div className="min-h-screen" dir="rtl">
      <SeoHead
        title={SEO.subjects.title}
        description={SEO.subjects.description}
        keywords={SEO.subjects.keywords}
        canonicalPath="/subjects"
        breadcrumbs={[{ name: 'المواد', url: `${SITE_URL}/subjects` }]}
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <Breadcrumbs items={[{ name: 'المواد', url: `${SITE_URL}/subjects` }]} className="mb-6" />
        <header className="text-center">
          <h1 className="font-display text-3xl font-extrabold sm:text-5xl"><span className="text-gradient">المواد والصفوف</span></h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-foreground-muted">
            اختر صفك الدراسي واستعرض الوحدات المتاحة — كل وحدة تشمل فيديوهات، ملازم PDF وسبورات تفاعلية مع تفعيل مدى الحياة بكود WLDN.
          </p>
        </header>

        <section className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STATIC_GRADES.map((grade) => {
            const count = prices ? (countByGrade[grade.name] ?? 0) : undefined;
            return (
              <Link
                key={grade.slug}
                to={`/subjects/${grade.slug}`}
                className="glass-card glass-card-hover conic-ring spotlight-card group flex flex-col gap-3 p-6"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/25 text-indigo-300 group-hover:scale-110 transition-transform">
                  <GraduationCap className="h-5 w-5" />
                </span>
                <h2 className="font-display text-base font-bold text-foreground">{grade.name}</h2>
                <p className="text-sm leading-6 text-foreground-muted">{grade.desc}</p>
                <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-indigo-300">
                  {count !== undefined ? `${count} وحدات متاحة` : 'عرض التفاصيل'}
                  <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
                </span>
              </Link>
            );
          })}
        </section>

        {/* Teaser pricing overview */}
        {prices && prices.length > 0 ? (
          <section className="mt-12">
            <h2 className="font-display text-xl font-bold text-foreground">لمحة أسعار (تيزر)</h2>
            <p className="mt-1 text-sm text-foreground-muted">أسماء الوحدات وأسعارها فقط — بدون كشف فيديو أو ملف محمي.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {prices.slice(0, 6).map((p) => (
                <div key={p.unit_id} className="glass-soft rounded-xl p-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-foreground"><BookOpen className="h-4 w-4 text-indigo-300" /> {p.unit_name}</p>
                  <p className="mt-1 text-xs text-foreground-subtle">{p.grade_name ?? ''}</p>
                  <p className="mt-2 font-display text-lg font-extrabold text-gradient">{p.total_price} ج.م</p>
                </div>
              ))}
            </div>
            <Link to="/pricing" className="mt-4 inline-flex text-sm font-bold text-indigo-300 hover:text-indigo-200">عرض كل الأسعار ←</Link>
          </section>
        ) : null}

        <div className="mt-10 flex flex-wrap gap-3 justify-center">
          <Link to="/pricing" className="btn-primary inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-white">الأسعار المفصلة</Link>
          <Link to="/how-it-works" className="glass-soft inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-foreground">كيف أبدأ؟</Link>
        </div>
      </div>
    </div>
  );
}
