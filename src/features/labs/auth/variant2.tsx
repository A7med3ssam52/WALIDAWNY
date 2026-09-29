import { useState } from 'react';
import { Link } from 'react-router-dom';

import { BrandIcon } from '../../../components/BrandIcon';
import { SeoHead } from '../../../components/SeoHead';
import { MockField, MockGradeChips, MockShell, MockSubmit } from './mockKit';

/**
 * Labs auth variant 2 — calm centered card on a dotted backdrop.
 * UI mock only: no backend, no persistence, noindex.
 */

function CenterFrame({
  testId,
  path,
  title,
  subtitle,
  children,
  footer,
}: {
  testId: string;
  path: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <MockShell testId={testId}>
      <SeoHead
        title={`معمل التصميم 2 — ${title}`}
        description="اقتراح تصميم لصفحات الدخول والتسجيل — عرض تجريبي"
        canonicalPath={path}
        noIndex
      />
      <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] bg-[size:26px_26px] px-4 py-10">
        <Link
          to="/labs/auth"
          className="mb-6 flex items-center gap-2.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label="معرض تصاميم الدخول والتسجيل"
        >
          <BrandIcon className="h-10 w-10" />
          <span className="font-display text-lg font-black text-foreground">وليد عونى</span>
        </Link>
        <main className="glass-card w-full max-w-sm p-6 sm:p-8">
          <p className="text-xs font-black tracking-wide text-primary-strong">اقتراح 2 — هادئ</p>
          <h1 className="mt-1 font-display text-2xl font-black text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </main>
        <div className="mt-4 w-full max-w-sm text-center">{footer}</div>
      </div>
    </MockShell>
  );
}

export function Login2() {
  return (
    <CenterFrame
      testId="labs-login2"
      path="/labs/login2"
      title="تسجيل الدخول"
      subtitle="ادخل بياناتك للمتابعة"
      footer={
        <p className="text-sm text-foreground-muted">
          ليس لديك حساب؟{' '}
          <Link to="/labs/register2" className="font-semibold text-primary-strong hover:underline">
            إنشاء حساب جديد
          </Link>
        </p>
      }
    >
      <MockSubmit testId="labs-login2-submit" submitLabel="تسجيل الدخول">
        <MockField label="البريد الإلكتروني" name="email" type="email" dir="ltr" placeholder="you@example.com" />
        <MockField label="كلمة المرور" name="password" type="password" />
      </MockSubmit>
    </CenterFrame>
  );
}

export function Register2() {
  const [gradeId, setGradeId] = useState('');
  return (
    <CenterFrame
      testId="labs-register2"
      path="/labs/register2"
      title="حساب جديد"
      subtitle="خطوة واحدة وتكون معنا"
      footer={
        <p className="text-sm text-foreground-muted">
          لديك حساب بالفعل؟{' '}
          <Link to="/labs/login2" className="font-semibold text-primary-strong hover:underline">
            تسجيل الدخول
          </Link>
        </p>
      }
    >
      <MockSubmit testId="labs-register2-submit" submitLabel="إنشاء الحساب">
        <MockField label="الاسم بالكامل" name="fullName" placeholder="مثال: أحمد محمد" />
        <MockField label="رقم الهاتف" name="phone" type="tel" dir="ltr" placeholder="01xxxxxxxxx" />
        <MockField label="رقم هاتف ولي الأمر" name="guardianPhone" type="tel" dir="ltr" placeholder="01xxxxxxxxx" />
        <MockGradeChips value={gradeId} onChange={setGradeId} testPrefix="labs-register2" />
        <MockField label="كلمة المرور" name="password" type="password" hint="6 أحرف على الأقل" />
        <MockField label="تأكيد كلمة المرور" name="confirmPassword" type="password" />
      </MockSubmit>
    </CenterFrame>
  );
}
