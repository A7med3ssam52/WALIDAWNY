import { Link } from 'react-router-dom';
import { Compass, GraduationCap } from 'lucide-react';

import { SeoHead } from '../../components/SeoHead';
import { SEO, SITE_URL } from '../../lib/seo';
import { getBreadcrumbJsonLd } from '../../lib/seo';

export function NotFoundPage() {
  const breadcrumb = getBreadcrumbJsonLd([{ name: 'الرئيسية', url: `${SITE_URL}/` }, { name: '404', url: `${SITE_URL}/404` }]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground" dir="rtl">
      <SeoHead
        title={SEO.notFound.title}
        description={SEO.notFound.description}
        canonicalPath="/404"
        noIndex
        robots="noindex, nofollow"
        jsonLd={breadcrumb as unknown as Record<string, unknown>}
      />
      <div className="glass-card w-full max-w-md p-8 text-center">
        <span aria-hidden="true" className="health-lime-card mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl">
          <GraduationCap className="h-7 w-7" />
        </span>
        <h1 className="mt-6 font-display text-6xl font-extrabold leading-tight text-foreground sm:text-7xl">
          404
        </h1>
        <p className="mt-3 text-base font-bold text-foreground">الصفحة التي تبحث عنها غير موجودة</p>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-foreground-muted">
          ربما انتقلت إلى مكان آخر أو تم حذفها. يمكنك العودة إلى الرئيسية والمتابعة من حيث توقفت
        </p>
        <Link to="/" className="btn-primary mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-bold sm:text-base">
          <Compass aria-hidden="true" className="h-4 w-4" />
          العودة إلى الرئيسية
        </Link>
        <nav aria-label="روابط مفيدة" className="mt-6 flex flex-wrap justify-center gap-3 text-xs font-bold">
          <Link to="/subjects" className="text-primary-strong hover:underline">المواد</Link>
          <Link to="/pricing" className="text-primary-strong hover:underline">الأسعار</Link>
          <Link to="/faq" className="text-primary-strong hover:underline">الأسئلة</Link>
          <Link to="/contact" className="text-foreground-muted hover:text-foreground">تواصل</Link>
        </nav>
      </div>
    </div>
  );
}
