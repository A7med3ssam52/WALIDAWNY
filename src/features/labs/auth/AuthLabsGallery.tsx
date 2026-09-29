import { Link } from 'react-router-dom';
import { ArrowLeft, FlaskConical } from 'lucide-react';

import { BrandIcon } from '../../../components/BrandIcon';
import { SeoHead } from '../../../components/SeoHead';
import { LAB_AUTH_VARIANTS } from './authLabsData';
import { MockShell } from './mockKit';

/**
 * /labs/auth — gallery comparing the 5 auth design proposals.
 * UI mock only: no backend, no persistence, noindex.
 */
export function AuthLabsGallery() {
  return (
    <MockShell testId="labs-auth-gallery">
      <SeoHead
        title="معمل تصاميم الدخول والتسجيل"
        description="خمسة اقتراحات لتصميم صفحات تسجيل الدخول وإنشاء حساب — عرض تجريبي"
        canonicalPath="/labs/auth"
        noIndex
      />
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6">
        <div className="flex items-center gap-2.5">
          <BrandIcon className="h-10 w-10" />
          <span className="font-display text-lg font-black text-foreground">وليد عونى</span>
          <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-[11px] font-black text-primary-strong">
            <FlaskConical aria-hidden="true" className="h-3.5 w-3.5" />
            معمل التصميم
          </span>
        </div>
        <h1 className="mt-8 font-display text-3xl font-black text-foreground">
          اقتراحات الدخول والتسجيل
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-foreground-muted">
          خمسة اتجاهات تصميمية لصفحتي تسجيل الدخول وإنشاء حساب — كلها عروض تجريبية
          بدون إرسال أي بيانات. اختر اتجاهاً لمعاينته.
        </p>
        <main className="mt-6 grid gap-4 md:grid-cols-2">
          {LAB_AUTH_VARIANTS.map((variant) => (
            <article
              key={variant.id}
              data-testid={`labs-auth-card-${variant.id}`}
              className="glass-card flex flex-col p-5 sm:p-6"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary font-display text-sm font-black text-primary-foreground"
                >
                  {variant.id}
                </span>
                <h2 className="font-display text-lg font-black text-foreground">{variant.name}</h2>
              </div>
              <p className="mt-2 flex-1 text-sm leading-7 text-foreground-muted">
                {variant.description}
              </p>
              <div className="mt-4 flex gap-2">
                <Link
                  to={variant.loginPath}
                  data-testid={`labs-auth-link-login${variant.id}`}
                  className="btn-primary inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-black"
                >
                  دخول {variant.id}
                  <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                </Link>
                <Link
                  to={variant.registerPath}
                  data-testid={`labs-auth-link-register${variant.id}`}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-4 text-sm font-bold text-foreground hover:border-primary/50"
                >
                  تسجيل {variant.id}
                  <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))}
        </main>
        <p className="mt-6 text-center text-xs text-foreground-subtle">
          عرض تجريبي — لا يتم إرسال أي بيانات لأي خادم
        </p>
      </div>
    </MockShell>
  );
}
