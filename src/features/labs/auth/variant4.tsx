import { useState } from 'react';
import { Link } from 'react-router-dom';

import { BrandIcon } from '../../../components/BrandIcon';
import { SeoHead } from '../../../components/SeoHead';
import { MockField, MockGradeChips, MockShell, MockSubmit } from './mockKit';

/**
 * Labs auth variant 4 — floating glass card over a muted mesh.
 * UI mock only: no backend, no persistence, noindex.
 */

function MeshFrame({
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
        title={`معمل التصميم 4 — ${title}`}
        description="اقتراح تصميم لصفحات الدخول والتسجيل — عرض تجريبي"
        canonicalPath={path}
        noIndex
      />
      <div className="relative flex min-h-screen flex-col overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <span className="absolute -top-24 start-1/4 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <span className="absolute bottom-0 end-1/4 h-80 w-80 rounded-full bg-accent-soft blur-3xl" />
          <span className="absolute top-1/2 start-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary-soft blur-3xl" />
        </div>
        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
          <div className="mb-5 flex flex-col items-center text-center">
            <BrandIcon className="h-14 w-14" />
            <p className="mt-3 text-xs font-black tracking-wide text-primary-strong">اقتراح 4 — زجاجي</p>
            <h1 className="mt-1 font-display text-3xl font-black text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p>
          </div>
          <main className="glass-panel rounded-[20px] p-6 sm:p-8">{children}</main>
          <div className="mt-4 text-center">{footer}</div>
        </div>
      </div>
    </MockShell>
  );
}

export function Login4() {
  return (
    <MeshFrame
      testId="labs-login4"
      path="/labs/login4"
      title="أهلاً بعودتك"
      subtitle="سجل الدخول للمتابعة من حيث توقفت"
      footer={
        <p className="text-sm text-foreground-muted">
          ليس لديك حساب؟{' '}
          <Link to="/labs/register4" className="font-semibold text-primary-strong hover:underline">
            إنشاء حساب جديد
          </Link>
        </p>
      }
    >
      <MockSubmit testId="labs-login4-submit" submitLabel="تسجيل الدخول">
        <MockField label="البريد الإلكتروني" name="email" type="email" dir="ltr" placeholder="you@example.com" />
        <MockField label="كلمة المرور" name="password" type="password" />
      </MockSubmit>
    </MeshFrame>
  );
}

export function Register4() {
  const [gradeId, setGradeId] = useState('');
  return (
    <MeshFrame
      testId="labs-register4"
      path="/labs/register4"
      title="انضم إلينا"
      subtitle="حسابك الجديد في أقل من دقيقة"
      footer={
        <p className="text-sm text-foreground-muted">
          لديك حساب بالفعل؟{' '}
          <Link to="/labs/login4" className="font-semibold text-primary-strong hover:underline">
            تسجيل الدخول
          </Link>
        </p>
      }
    >
      <MockSubmit testId="labs-register4-submit" submitLabel="إنشاء الحساب">
        <MockField label="الاسم بالكامل" name="fullName" placeholder="مثال: أحمد محمد" />
        <MockField label="رقم الهاتف" name="phone" type="tel" dir="ltr" placeholder="01xxxxxxxxx" />
        <MockField label="رقم هاتف ولي الأمر" name="guardianPhone" type="tel" dir="ltr" placeholder="01xxxxxxxxx" />
        <MockGradeChips value={gradeId} onChange={setGradeId} testPrefix="labs-register4" />
        <MockField label="كلمة المرور" name="password" type="password" hint="6 أحرف على الأقل" />
        <MockField label="تأكيد كلمة المرور" name="confirmPassword" type="password" />
      </MockSubmit>
    </MeshFrame>
  );
}
