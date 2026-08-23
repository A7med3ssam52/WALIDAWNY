import { Link } from 'react-router-dom';

import { Breadcrumbs } from '../../components/Breadcrumbs';
import { SeoHead } from '../../components/SeoHead';
import { SEO, SITE_URL } from '../../lib/seo';

export function TermsPage() {
  return (
    <div className="min-h-screen" dir="rtl">
      <SeoHead
        title={SEO.terms.title}
        description={SEO.terms.description}
        keywords={SEO.terms.keywords}
        canonicalPath="/terms"
        breadcrumbs={[{ name: 'الشروط والأحكام', url: `${SITE_URL}/terms` }]}
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <Breadcrumbs items={[{ name: 'الشروط', url: `${SITE_URL}/terms` }]} className="mb-6" />
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl"><span className="text-gradient">الشروط والأحكام</span></h1>
        <p className="mt-2 text-xs text-foreground-subtle">آخر تحديث: 23 أغسطس 2026</p>

        <div className="glass-card mt-8 space-y-6 p-6 sm:p-8 text-sm leading-7 text-foreground-muted">
          <section>
            <h2 className="font-display text-base font-bold text-foreground">1. إنشاء الحساب</h2>
            <p>يجب تقديم بيانات صحيحة (اسم، بريد، هاتف، ولي الأمر، عنوان، صف دراسي). حساب واحد لكل طالب — مشاركة الحساب ممنوعة.</p>
          </section>
          <section>
            <h2 className="font-display text-base font-bold text-foreground">2. شراء وتفعيل الوحدات</h2>
            <p>كل وحدة تُشترى بكود WLDN-XXXX منفصل. الكود يُستخدم مرة واحدة ويرتبط بحسابك للأبد (مدى الحياة). لا يمكن نقل الوحدة لحساب آخر بعد التفعيل.</p>
          </section>
          <section>
            <h2 className="font-display text-base font-bold text-foreground">3. المحتوى والملكية</h2>
            <p>كل الفيديوهات والملازم والسبورات محمية بحقوق — يمنع التحميل أو التسريب أو إعادة النشر. أي انتهاك قد يؤدي لإيقاف الحساب.</p>
          </section>
          <section>
            <h2 className="font-display text-base font-bold text-foreground">4. الاستخدام المسموح</h2>
            <p>المشاهدة مسموحة لصاحب الحساب فقط من أجهزته الشخصية. يمنع استخدام أدوات تحميل أو مشاركة الكود مع آخرين.</p>
          </section>
          <section>
            <h2 className="font-display text-base font-bold text-foreground">5. الدفع والاسترجاع</h2>
            <p>الدفع يتم عبر واتساب. المحتوى الرقمي لا يسترجع بعد التفعيل، لكن في حال عطل تقني يمنع الوصول سنقدم حلاً مناسباً بعد التواصل مع الدعم.</p>
          </section>
          <section>
            <h2 className="font-display text-base font-bold text-foreground">6. التغييرات</h2>
            <p>قد نحدث الشروط مع إشعار داخل المنصة. استمرار استخدامك يعني موافقتك على الشروط المحدثة.</p>
          </section>
        </div>

        <div className="mt-8 flex gap-3">
          <Link to="/privacy" className="text-sm font-bold text-indigo-300 hover:text-indigo-200">سياسة الخصوصية ←</Link>
          <Link to="/" className="text-sm font-bold text-foreground-muted hover:text-foreground">الرئيسية ←</Link>
        </div>
      </div>
    </div>
  );
}
