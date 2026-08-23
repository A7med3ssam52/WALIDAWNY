import { Link } from 'react-router-dom';
import { GraduationCap, BookOpen, Users, Award, Sparkles } from 'lucide-react';

import { Breadcrumbs } from '../../components/Breadcrumbs';
import { SeoHead } from '../../components/SeoHead';
import { SEO, SITE_URL } from '../../lib/seo';

export function AboutPage() {
  return (
    <div className="min-h-screen" dir="rtl">
      <SeoHead
        title={SEO.about.title}
        description={SEO.about.description}
        keywords={SEO.about.keywords}
        canonicalPath="/about"
        breadcrumbs={[{ name: 'عن المنصة', url: `${SITE_URL}/about` }]}
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <Breadcrumbs items={[{ name: 'عن المنصة', url: `${SITE_URL}/about` }]} className="mb-6" />

        <header className="text-center">
          <span className="glass-soft inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold text-indigo-300">
            <Sparkles aria-hidden className="h-3.5 w-3.5 text-fuchsia-300" />
            تعرف علينا
          </span>
          <h1 className="mx-auto mt-4 max-w-3xl font-display text-3xl font-extrabold leading-tight sm:text-5xl">
            <span className="text-gradient">عن منصة وليد عونى</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-foreground-muted sm:text-base">
            منصة تعليمية مصرية أسسها مستر وليد عونى لتقديم شرح منهجي مبسط لطلاب الإعدادي والثانوي — وحدات مدى الحياة بكود WLDN، متابعة تقدم، ملازم PDF وسبورات تفاعلية.
          </p>
        </header>

        <section className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { icon: GraduationCap, title: 'خبرة تدريسية', desc: 'سنوات من الشرح المبسط والمنهج المنظم لكل الصفوف الإعدادية والثانوية بمنهج مصري معتمد.' },
            { icon: BookOpen, title: 'منهج منظم', desc: 'صفوف ووحدات ودروس مرتبة تتيح لك المذاكرة خطوة بخطوة حتى المراجعة النهائية بدون تشتيت.' },
            { icon: Users, title: 'دعم مباشر', desc: 'تواصل واتساب مباشر مع الأستاذ — رد سريع، متابعة شخصية، ومساعدة في التفعيل والمنهج.' },
          ].map((b) => (
            <div key={b.title} className="glass-card conic-ring spotlight-card p-6 text-center">
              <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/25 text-indigo-300">
                <b.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-3 font-display text-base font-bold text-foreground">{b.title}</h2>
              <p className="mt-1 text-sm leading-6 text-foreground-muted">{b.desc}</p>
            </div>
          ))}
        </section>

        <section className="glass-card conic-ring spotlight-card relative mt-10 overflow-hidden p-6 sm:p-10">
          <h2 className="font-display text-xl font-bold text-foreground sm:text-2xl">فلسفة الشرح المبسط</h2>
          <p className="mt-3 text-sm leading-7 text-foreground-muted">
            نؤمن أن الفهم يسبق الحفظ. لذلك نعتمد على تقسيم المنهج إلى وحدات صغيرة مدى الحياة، كل وحدة تضم فيديوهات قصيرة مركزة، ملازم PDF تلخيصية، وسبورات تفاعلية ترسم الفكرة أمامك. كل درس ينتهي بسؤال يثبت المعلومة، وكل وحدة تمنحك متابعة تقدم لحظية تعرفك أين توقفت وإلى أين تتجه. المحتوى محمي وخاص بالمشتركين، لكن الصورة العامة للمنهج وأسعار الوحدات متاحة بشفافية قبل الشراء.
          </p>
          <p className="mt-3 text-sm leading-7 text-foreground-muted">
            نستخدم نفس المصطلحات التي يبحث عنها طلاب مصر — تالتة إعدادي، تانية إعدادي، أولى ثانوي — لأننا نتحدث بلغتك اليومية، لا بلغة كتب معقدة. كود التفعيل WLDN-XXXX يضمن لك وصول دائم بدون اشتراك شهري، مع دعم واتساب مباشر يحل أي استفسار خلال دقائق.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/how-it-works" className="btn-primary inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-white">
              كيف تبدأ رحلتك؟
            </Link>
            <Link to="/subjects" className="glass-soft inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-foreground">
              استعرض المواد
            </Link>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-display text-lg font-bold text-foreground">لماذا يختار الطلاب وليد عونى؟</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 text-sm leading-6 text-foreground-muted sm:grid-cols-2">
            <li className="flex items-start gap-2"><Award className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> شرح مبسط مدعوم بأمثلة من الامتحانات الحقيقية</li>
            <li className="flex items-start gap-2"><Award className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> ملازم PDF وسبورات تفاعلية لكل وحدة</li>
            <li className="flex items-start gap-2"><Award className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> شراء مرة واحدة مدى الحياة بدون تجديد</li>
            <li className="flex items-start gap-2"><Award className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> متابعة تقدم ووقت مشاهدة في لوحة الطالب</li>
          </ul>
        </section>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/8 pt-6 text-center sm:flex-row">
          <p className="text-xs text-foreground-subtle">© {new Date().getFullYear()} وليد عونى — منصة تعليمية مصرية</p>
          <nav className="flex gap-3 text-sm">
            <Link to="/faq" className="text-foreground-muted hover:text-primary">الأسئلة الشائعة</Link>
            <Link to="/pricing" className="text-foreground-muted hover:text-primary">الأسعار</Link>
            <Link to="/contact" className="text-foreground-muted hover:text-primary">تواصل</Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
