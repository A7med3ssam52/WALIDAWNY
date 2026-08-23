import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, ArrowLeft, GraduationCap } from 'lucide-react';

import { Breadcrumbs } from '../../components/Breadcrumbs';
import { SeoHead } from '../../components/SeoHead';
import { getPublicUnitPrices } from '../../data/rpc';
import { getCourseJsonLd, SITE_URL } from '../../lib/seo';
import type { PublicUnitPrice } from '../../types/database';

const GRADE_MAP: Record<string, { name: string; title: string; desc: string; keywords: string }> = {
  'first-prep': {
    name: 'الصف الأول الإعدادي',
    title: 'شرح منهج الصف الأول الإعدادي — وليد عونى | وحدات مدى الحياة',
    desc: 'شرح منهج الصف الأول الإعدادي على منصة وليد عونى — وحدات منظمة، فيديوهات مبسطة، ملازم PDF وسبورات تفاعلية مع تفعيل مدى الحياة بكود WLDN لكل وحدة. ابدأ الآن.',
    keywords: 'شرح اول اعدادي, منهج اولى اعدادي, وليد عونى اولى اعدادي',
  },
  'second-prep': {
    name: 'الصف الثاني الإعدادي',
    title: 'شرح منهج الصف الثاني الإعدادي — وليد عونى | وحدات مدى الحياة',
    desc: 'شرح منهج الصف الثاني الإعدادي على منصة وليد عونى — وحدات منظمة، فيديوهات عالية الجودة، ملازم PDF وسبورات مع كود تفعيل WLDN مدى الحياة. ابدأ رحلتك الآن.',
    keywords: 'شرح تانية اعدادي, منهج تانية اعدادي, وليد عونى تانية اعدادي',
  },
  'third-prep': {
    name: 'الصف الثالث الإعدادي',
    title: 'شرح منهج الصف الثالث الإعدادي — وليد عونى | وحدات مدى الحياة',
    desc: 'شرح منهج الصف الثالث الإعدادي ترم أول وثان على منصة وليد عونى — وحدات شاملة، مراجعات مركزة، ملازم PDF وسبورات مع تفعيل مدى الحياة بكود WLDN. ابدأ الآن.',
    keywords: 'شرح تالتة اعدادي, منهج تالتة اعدادي, مراجعة تالتة اعدادي, وليد عونى',
  },
  'first-secondary': {
    name: 'الصف الأول الثانوي',
    title: 'شرح منهج الصف الأول الثانوي — وليد عونى | وحدات مدى الحياة',
    desc: 'شرح منهج الصف الأول الثانوي على منصة وليد عونى — وحدات منظمة وتقدم متابع، فيديوهات وملازم PDF مع تفعيل فوري بكود WLDN لكل وحدة مع دعم مباشر. ابدأ الآن.',
    keywords: 'شرح اولى ثانوي, منهج اولى ثانوي, وليد عونى ثانوي',
  },
  'second-secondary': {
    name: 'الصف الثاني الثانوي',
    title: 'شرح منهج الصف الثاني الثانوي — وليد عونى | وحدات مدى الحياة',
    desc: 'شرح منهج الصف الثاني الثانوي على منصة وليد عونى — وحدات متقدمة، شرح مبسط وملازم PDF مع دعم واتساب وتفعيل مدى الحياة بكود WLDN مع متابعة. ابدأ الآن بثقة.',
    keywords: 'شرح تانية ثانوي, منهج تانية ثانوي',
  },
  'third-secondary': {
    name: 'الصف الثالث الثانوي',
    title: 'شرح منهج الصف الثالث الثانوي — وليد عونى | وحدات مدى الحياة',
    desc: 'شرح منهج الصف الثالث الثانوي على منصة وليد عونى — وحدات شاملة تؤهلك للتفوق، فيديوهات وملازم PDF وسبورات مع كود WLDN مدى الحياة ودعم مباشر. ابدأ الآن.',
    keywords: 'شرح تالتة ثانوي, منهج تالتة ثانوي',
  },
};

export function GradeLandingPage() {
  const { gradeSlug = '' } = useParams();
  const grade = GRADE_MAP[gradeSlug];
  const [prices, setPrices] = useState<PublicUnitPrice[] | null>(null);

  useEffect(() => {
    void getPublicUnitPrices()
      .then(setPrices)
      .catch(() => setPrices([]));
  }, []);

  const units = useMemo(() => {
    if (!prices || !grade) return [];
    // Try to filter by grade name match (teaser — no lesson disclosure)
    return prices.filter((p) => p.grade_name === grade.name);
  }, [prices, grade]);

  if (!grade) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center" dir="rtl">
        <SeoHead title="الصف غير موجود | وليد عونى" description="الصف الذي تبحث عنه غير موجود. استعرض المواد المتاحة." canonicalPath={`/subjects/${gradeSlug}`} noIndex />
        <h1 className="font-display text-2xl font-bold text-foreground">الصف غير موجود</h1>
        <p className="mt-2 text-sm text-foreground-muted">تأكد من الرابط أو عد إلى قائمة المواد.</p>
        <Link to="/subjects" className="btn-primary mt-6 inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-white">المواد</Link>
      </div>
    );
  }

  const canonicalPath = `/subjects/${gradeSlug}`;
  const courseJsonLd = units.slice(0, 5).map((u) =>
    getCourseJsonLd({
      name: `${grade.name} — ${u.unit_name}`,
      description: `شرح مبسط لوحدة ${u.unit_name} لطلاب ${grade.name} — متاح مدى الحياة بكود WLDN.`,
      url: `${SITE_URL}/pricing`,
      price: u.total_price,
    }),
  );

  return (
    <div className="min-h-screen" dir="rtl">
      <SeoHead
        title={grade.title}
        description={grade.desc}
        keywords={grade.keywords}
        canonicalPath={canonicalPath}
        breadcrumbs={[
          { name: 'المواد', url: `${SITE_URL}/subjects` },
          { name: grade.name, url: `${SITE_URL}${canonicalPath}` },
        ]}
        extraJsonLd={courseJsonLd as unknown as Record<string, unknown>[]}
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <Breadcrumbs items={[{ name: 'المواد', url: `${SITE_URL}/subjects` }, { name: grade.name, url: `${SITE_URL}${canonicalPath}` }]} className="mb-6" />

        <header className="text-center">
          <span className="glass-soft inline-flex items-center gap-2 rounded-full px-4 py-1 text-xs font-bold text-indigo-300">
            <GraduationCap className="h-3.5 w-3.5" /> {grade.name}
          </span>
          <h1 className="mx-auto mt-3 max-w-3xl font-display text-3xl font-extrabold leading-tight sm:text-5xl">
            <span className="text-gradient">شرح منهج {grade.name}</span> — وليد عونى
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-foreground-muted">
            منهج {grade.name} بشكل منظم ومبسط — كل وحدة تُفتح مدى الحياة بكود WLDN، مع فيديوهات عالية الجودة، ملازم PDF وسبورات تفاعلية. نعرض هنا أسماء الوحدات وأسعارها فقط (تيزر) بدون كشف محتوى محمي.
          </p>
        </header>

        <section className="glass-card mt-10 p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold text-foreground">ماذا ستتعلم في {grade.name}؟</h2>
          <p className="mt-2 text-sm leading-7 text-foreground-muted">
            منهج {grade.name} على منصة وليد عونى مقسم إلى وحدات متسلسلة تراعي التدرج — من التأسيس إلى المراجعة النهائية. كل وحدة تركز على فهم الأفكار قبل الحفظ، مع أمثلة من الامتحانات السابقة وسبورات توضح كل خطوة. تابع تقدمك في لوحة الطالب، وشاهد أي درس أكثر من مرة بدون حدود. للمزيد عن طريقة العمل، زر صفحة كيف تبدأ.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/how-it-works" className="text-sm font-bold text-indigo-300 hover:text-indigo-200">كيف أبدأ؟ ←</Link>
            <Link to="/faq" className="text-sm font-bold text-foreground-muted hover:text-foreground">الأسئلة الشائعة ←</Link>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-bold text-foreground">الوحدات المتاحة — {grade.name}</h2>
          <p className="mt-1 text-sm text-foreground-muted">تيزر فقط: اسم الوحدة + السعر. تفاصيل الفيديو والملفات محمية بعد التفعيل.</p>
          {prices === null ? (
            <p className="mt-4 text-sm text-foreground-muted">جاري تحميل الوحدات...</p>
          ) : units.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {units.map((u) => (
                <div key={u.unit_id} className="glass-card conic-ring spotlight-card p-5">
                  <BookOpen className="h-5 w-5 text-indigo-300" />
                  <h3 className="mt-2 font-display text-sm font-bold text-foreground">{u.unit_name}</h3>
                  <p className="mt-1 text-xs text-foreground-subtle">{grade.name}</p>
                  <p className="mt-2 font-display text-xl font-extrabold text-gradient">{u.total_price} ج.م</p>
                  <p className="text-xs text-foreground-subtle">شامل رسوم المنصة — تفعيل مدى الحياة بكود WLDN</p>
                  <Link to="/pricing" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-300 hover:text-indigo-200">التفاصيل والشراء <ArrowLeft className="h-3 w-3" /></Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
              <p className="text-sm text-foreground-muted">لا توجد وحدات منشورة لهذا الصف حالياً — تابع صفحة الأسعار أو تواصل عبر واتساب.</p>
              <Link to="/pricing" className="btn-primary mt-4 inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-bold text-white">عرض كل الأسعار</Link>
            </div>
          )}
        </section>

        <div className="mt-10 flex flex-wrap gap-3 justify-center">
          <Link to="/subjects" className="glass-soft inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-foreground">كل الصفوف</Link>
          <Link to="/pricing" className="btn-primary inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-white">الأسعار</Link>
        </div>
      </div>
    </div>
  );
}
