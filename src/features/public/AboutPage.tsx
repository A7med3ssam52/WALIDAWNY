import { Link } from 'react-router-dom';
import { GraduationCap, BookOpen, Users, Award, Sparkles } from 'lucide-react';

import { Breadcrumbs } from '../../components/Breadcrumbs';
import { SeoHead } from '../../components/SeoHead';
import { SEO, SITE_URL } from '../../lib/seo';

export function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
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
          <span className="health-lime-card inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold">
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
            تعرف علينا
          </span>
          <h1 className="mx-auto mt-4 max-w-3xl font-display text-3xl font-extrabold leading-tight text-foreground sm:text-5xl">
            عن منصة وليد عونى
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
            <div key={b.title} className="glass-card p-6 text-center">
              <span className="card-chip mx-auto inline-flex h-11 w-11 items-center justify-center">
                <b.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-3 font-display text-base font-bold text-foreground">{b.title}</h2>
              <p className="mt-1 text-sm leading-6 text-foreground-muted">{b.desc}</p>
            </div>
          ))}
        </section>

        <section className="glass-card mt-10 p-6 sm:p-10">
          <h2 className="font-display text-xl font-bold text-foreground sm:text-2xl">فلسفة الشرح المبسط</h2>
          <p className="mt-3 text-sm leading-7 text-foreground-muted">
            نؤمن أن الفهم يسبق الحفظ. لذلك نعتمد على تقسيم المنهج إلى وحدات صغيرة مدى الحياة، كل وحدة تضم فيديوهات قصيرة مركزة، ملازم PDF تلخيصية، وسبورات تفاعلية ترسم الفكرة أمامك. كل درس ينتهي بسؤال يثبت المعلومة، وكل وحدة تمنحك متابعة تقدم لحظية تعرفك أين توقفت وإلى أين تتجه. المحتوى محمي وخاص بالمشتركين، لكن الصورة العامة للمنهج وأسعار الوحدات متاحة بشفافية قبل الشراء.
          </p>
          <p className="mt-3 text-sm leading-7 text-foreground-muted">
            نستخدم نفس المصطلحات التي يبحث عنها طلاب مصر — تالتة إعدادي، تانية إعدادي، أولى ثانوي — لأننا نتحدث بلغتك اليومية، لا بلغة كتب معقدة. كود التفعيل WLDN-XXXX يضمن لك وصول دائم بدون اشتراك شهري، مع دعم واتساب مباشر يحل أي استفسار خلال دقائق.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/how-it-works" className="btn-primary inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-bold">
              كيف تبدأ رحلتك؟
            </Link>
            <Link to="/subjects" className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-surface px-6 text-sm font-bold text-foreground hover:border-primary/50">
              استعرض المواد
            </Link>
          </div>
        </section>

        <section className="health-dark-card mt-10 rounded-[20px] p-6">
          <h2 className="font-display text-lg font-bold">لماذا يختار الطلاب وليد عونى؟</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 text-sm leading-6 text-white/80 sm:grid-cols-2">
            <li className="flex items-start gap-2"><Award className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> شرح مبسط مدعوم بأمثلة من الامتحانات الحقيقية</li>
            <li className="flex items-start gap-2"><Award className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> ملازم PDF وسبورات تفاعلية لكل وحدة</li>
            <li className="flex items-start gap-2"><Award className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> شراء مرة واحدة مدى الحياة بدون تجديد</li>
            <li className="flex items-start gap-2"><Award className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> متابعة تقدم ووقت مشاهدة في لوحة الطالب</li>
          </ul>
        </section>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-center sm:flex-row">
          <p className="text-xs text-foreground-subtle">© {new Date().getFullYear()} وليد عونى — منصة تعليمية مصرية</p>
          <nav className="flex gap-3 text-sm">
            <Link to="/faq" className="text-foreground-muted hover:text-primary-strong">الأسئلة الشائعة</Link>
            <Link to="/pricing" className="text-foreground-muted hover:text-primary-strong">الأسعار</Link>
            <Link to="/contact" className="text-foreground-muted hover:text-primary-strong">تواصل</Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
