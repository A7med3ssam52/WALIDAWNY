import { Link } from 'react-router-dom';
import { UserPlus, KeyRound, Play, MessageCircle, CheckCircle } from 'lucide-react';

import { Breadcrumbs } from '../../components/Breadcrumbs';
import { SeoHead } from '../../components/SeoHead';
import { SEO, SITE_URL } from '../../lib/seo';

export function HowItWorksPage() {
  const steps = [
    {
      n: 1,
      icon: UserPlus,
      title: 'أنشئ حسابك',
      desc: 'سجّل بياناتك (الاسم، البريد، رقم الهاتف، رقم ولي الأمر، العنوان، الصف الدراسي) في أقل من دقيقة. حسابك هو مفتاح وحداتك مدى الحياة.',
    },
    {
      n: 2,
      icon: KeyRound,
      title: 'احصل على كود WLDN-XXXX',
      desc: 'تواصل عبر واتساب مع الأستاذ، اختر الوحدة التي تريدها، وبعد تأكيد الدفع يرسل لك كود التفعيل بصيغة WLDN-XXXX.',
    },
    {
      n: 3,
      icon: Play,
      title: 'فعّل وشاهد',
      desc: 'أدخل الكود في صفحة التفعيل داخل لوحة الطالب — تفتح الوحدة فوراً وتشاهد الفيديوهات والملازم والسبورات بدون حدود.',
    },
  ];

  return (
    <div className="min-h-screen" dir="rtl">
      <SeoHead
        title={SEO.howItWorks.title}
        description={SEO.howItWorks.description}
        keywords={SEO.howItWorks.keywords}
        canonicalPath="/how-it-works"
        breadcrumbs={[{ name: 'كيف تبدأ', url: `${SITE_URL}/how-it-works` }]}
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <Breadcrumbs items={[{ name: 'كيف تبدأ', url: `${SITE_URL}/how-it-works` }]} className="mb-6" />

        <header className="text-center">
          <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-5xl">
            <span className="text-gradient">كيف تبدأ رحلتك؟</span>
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-foreground-muted sm:text-base">
            ثلاث خطوات فقط تفصلك عن وحداتك مدى الحياة — تسجيل، كود WLDN، ومشاهدة فورية مع دعم واتساب مباشر.
          </p>
        </header>

        <section className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="glass-card conic-ring spotlight-card relative p-6 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 text-white font-bold shadow-[0_0_30px_-6px_rgba(129,140,248,0.9)]">
                {s.n}
              </span>
              <s.icon className="mx-auto mt-4 h-6 w-6 text-indigo-300" />
              <h2 className="mt-2 font-display text-base font-bold text-foreground">{s.title}</h2>
              <p className="mt-1 text-sm leading-6 text-foreground-muted">{s.desc}</p>
            </div>
          ))}
        </section>

        <section className="glass-card mt-10 p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold text-foreground">ما هو كود WLDN؟</h2>
          <p className="mt-2 text-sm leading-7 text-foreground-muted">
            كود بصيغة <span className="font-mono text-indigo-300">WLDN-XXXX</span> (أحرف وأرقام) يُولّد لكل وحدة ويُرسل لك بعد الشراء. إدخال الكود مرة واحدة يربط الوحدة بحسابك للأبد — بدون اشتراك شهري، بدون انتهاء. يمكنك تفعيل أكثر من وحدة بأكثر من كود، وكل وحدة تظهر في لوحة الطالب مع نسبة تقدم منفصلة.
          </p>
          <ul className="mt-4 grid gap-2 text-sm text-foreground-muted sm:grid-cols-2">
            <li className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-emerald-300" /> كود واحد = وحدة واحدة مدى الحياة</li>
            <li className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-emerald-300" /> لا يمكن استخدام الكود مرتين أو نقل الوحدة</li>
            <li className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-emerald-300" /> يصل عبر واتساب بعد تأكيد الدفع</li>
            <li className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-emerald-300" /> دعم فوري إذا واجهت مشكلة في التفعيل</li>
          </ul>
        </section>

        <section className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-emerald-200">
            <MessageCircle className="h-5 w-5" /> تحتاج مساعدة؟
          </h2>
          <p className="mt-2 text-sm leading-6 text-emerald-100/80">
            فريق الدعم متاح عبر واتساب للرد على أسئلة التفعيل والمنهج. متوسط الرد دقائق في ساعات العمل. يمكنك أيضاً زيارة صفحة الأسئلة الشائعة.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/register" className="btn-primary inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-white">
              أنشئ حسابك الآن
            </Link>
            <Link to="/faq" className="glass-soft inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-foreground">
              الأسئلة الشائعة
            </Link>
            <Link to="/pricing" className="glass-soft inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-foreground">
              عرض الأسعار
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
