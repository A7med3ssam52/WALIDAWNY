import { Link } from 'react-router-dom';

import { Breadcrumbs } from '../../components/Breadcrumbs';
import { SeoHead } from '../../components/SeoHead';
import { SEO, SITE_URL } from '../../lib/seo';

export function PrivacyPage() {
  return (
    <div className="min-h-screen" dir="rtl">
      <SeoHead
        title={SEO.privacy.title}
        description={SEO.privacy.description}
        keywords={SEO.privacy.keywords}
        canonicalPath="/privacy"
        breadcrumbs={[{ name: 'سياسة الخصوصية', url: `${SITE_URL}/privacy` }]}
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <Breadcrumbs items={[{ name: 'الخصوصية', url: `${SITE_URL}/privacy` }]} className="mb-6" />
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl"><span className="text-gradient">سياسة الخصوصية</span></h1>
        <p className="mt-2 text-xs text-foreground-subtle">آخر تحديث: 23 أغسطس 2026 — منصة وليد عونى WALIDAWNY</p>

        <div className="glass-card mt-8 space-y-6 p-6 sm:p-8 text-sm leading-7 text-foreground-muted">
          <section>
            <h2 className="font-display text-base font-bold text-foreground">1. البيانات التي نجمعها</h2>
            <p>نجمع الاسم، البريد الإلكتروني، أرقام الهاتف، العنوان، الصف الدراسي، وتقدمك الدراسي. لا نجمع بيانات دفع حساسة داخل المنصة — الدفع عبر واتساب خارجي.</p>
          </section>
          <section>
            <h2 className="font-display text-base font-bold text-foreground">2. كيف نستخدم بياناتك</h2>
            <p>لإنشاء حسابك، تفعيل وحداتك بكود WLDN، متابعة تقدمك، وإرسال إشعارات تعليمية. لا نشارك بياناتك مع أي طرف ثالث لأغراض تسويقية.</p>
          </section>
          <section>
            <h2 className="font-display text-base font-bold text-foreground">3. التخزين والأمان</h2>
            <p>البيانات مخزنة بشكل مشفر عبر Supabase مع اتصال HTTPS دائم وتشفير كلمات المرور. نستخدم RLS لحماية الوصول — كل طالب يرى بياناته فقط.</p>
          </section>
          <section>
            <h2 className="font-display text-base font-bold text-foreground">4. ملفات الارتباط</h2>
            <p>نستخدم ملفات ارتباط ضرورية فقط لتسجيل الدخول وتذكر الجلسة. لا نستخدم تتبع إعلاني افتراضياً — GA4 يضاف فقط عند تفعيله بموافقتك.</p>
          </section>
          <section>
            <h2 className="font-display text-base font-bold text-foreground">5. حقوقك</h2>
            <p>يمكنك طلب عرض بياناتك أو تعديلها أو حذف حسابك عبر التواصل على صفحة اتصل بنا. سنرد خلال 48 ساعة.</p>
          </section>
          <section>
            <h2 className="font-display text-base font-bold text-foreground">6. التواصل</h2>
            <p>لأي استفسار حول الخصوصية، راسلنا عبر واتساب أو عبر صفحة التواصل. هذه السياسة قد تتحدث مع إشعار داخل المنصة.</p>
          </section>
        </div>

        <div className="mt-8 flex gap-3">
          <Link to="/terms" className="text-sm font-bold text-indigo-300 hover:text-indigo-200">الشروط والأحكام ←</Link>
          <Link to="/" className="text-sm font-bold text-foreground-muted hover:text-foreground">الرئيسية ←</Link>
        </div>
      </div>
    </div>
  );
}
