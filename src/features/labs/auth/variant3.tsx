import { useState } from 'react';
import { Link } from 'react-router-dom';

import { BrandIcon } from '../../../components/BrandIcon';
import { SeoHead } from '../../../components/SeoHead';
import { MockField, MockGradeChips, MockShell, MockSteps, MockSubmit } from './mockKit';

/**
 * Labs auth variant 3 — stepped flow with a progress indicator.
 * UI mock only: no backend, no persistence, noindex.
 */

const REGISTER_STEPS = ['بياناتك', 'كلمة المرور', 'الصف الدراسي'];

function StepFrame({
  testId,
  path,
  kicker,
  title,
  subtitle,
  children,
  footer,
}: {
  testId: string;
  path: string;
  kicker: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <MockShell testId={testId}>
      <SeoHead
        title={`معمل التصميم 3 — ${title}`}
        description="اقتراح تصميم لصفحات الدخول والتسجيل — عرض تجريبي"
        canonicalPath={path}
        noIndex
      />
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-8 sm:px-6">
        <div className="flex items-center justify-center gap-2.5">
          <BrandIcon className="h-9 w-9" />
          <span className="font-display text-base font-black text-foreground">وليد عونى</span>
        </div>
        <main className="glass-card mt-6 flex-1 p-6 sm:p-8">
          <p className="text-xs font-black tracking-wide text-primary-strong">{kicker}</p>
          <h1 className="mt-1 font-display text-2xl font-black text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </main>
        <div className="mt-4 text-center">{footer}</div>
      </div>
    </MockShell>
  );
}

export function Login3() {
  return (
    <StepFrame
      testId="labs-login3"
      path="/labs/login3"
      kicker="اقتراح 3 — خطوة واحدة"
      title="تسجيل الدخول"
      subtitle="خطوة واحدة وتدخل منصتك"
      footer={
        <p className="text-sm text-foreground-muted">
          ليس لديك حساب؟{' '}
          <Link to="/labs/register3" className="font-semibold text-primary-strong hover:underline">
            إنشاء حساب جديد
          </Link>
        </p>
      }
    >
      <MockSteps steps={['تسجيل الدخول']} current={0} testPrefix="labs-login3" />
      <div className="mt-6">
        <MockSubmit testId="labs-login3-submit" submitLabel="دخول">
          <MockField label="البريد الإلكتروني" name="email" type="email" dir="ltr" placeholder="you@example.com" />
          <MockField label="كلمة المرور" name="password" type="password" />
        </MockSubmit>
      </div>
    </StepFrame>
  );
}

export function Register3() {
  const [step, setStep] = useState(0);
  const [gradeId, setGradeId] = useState('');
  const last = step === REGISTER_STEPS.length - 1;

  return (
    <StepFrame
      testId="labs-register3"
      path="/labs/register3"
      kicker={`اقتراح 3 — خطوة ${step + 1} من ${REGISTER_STEPS.length}`}
      title="إنشاء حساب جديد"
      subtitle={REGISTER_STEPS[step]}
      footer={
        <p className="text-sm text-foreground-muted">
          لديك حساب بالفعل؟{' '}
          <Link to="/labs/login3" className="font-semibold text-primary-strong hover:underline">
            تسجيل الدخول
          </Link>
        </p>
      }
    >
      <MockSteps steps={REGISTER_STEPS} current={step} testPrefix="labs-register3" />
      <div className="mt-6">
        {step === 0 ? (
          <div className="flex flex-col gap-4">
            <MockField label="الاسم بالكامل" name="fullName" placeholder="مثال: أحمد محمد" />
            <MockField label="رقم الهاتف" name="phone" type="tel" dir="ltr" placeholder="01xxxxxxxxx" />
            <MockField label="رقم هاتف ولي الأمر" name="guardianPhone" type="tel" dir="ltr" placeholder="01xxxxxxxxx" />
          </div>
        ) : null}
        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <MockField label="كلمة المرور" name="password" type="password" hint="6 أحرف على الأقل" />
            <MockField label="تأكيد كلمة المرور" name="confirmPassword" type="password" />
          </div>
        ) : null}
        {last ? <MockGradeChips value={gradeId} onChange={setGradeId} testPrefix="labs-register3" /> : null}
        <div className="mt-6 flex gap-2">
          {step > 0 ? (
            <button
              type="button"
              data-testid="labs-register3-back"
              onClick={() => setStep((s) => s - 1)}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-border bg-surface px-6 text-sm font-bold text-foreground-muted hover:text-foreground"
            >
              السابق
            </button>
          ) : null}
          {last ? (
            <div className="flex-[2]">
              <MockSubmit testId="labs-register3-submit" submitLabel="إنشاء الحساب" />
            </div>
          ) : (
            <button
              type="button"
              data-testid="labs-register3-next"
              onClick={() => setStep((s) => s + 1)}
              className="btn-primary inline-flex h-11 flex-[2] items-center justify-center rounded-full px-6 text-sm font-black"
            >
              التالي
            </button>
          )}
        </div>
      </div>
    </StepFrame>
  );
}
