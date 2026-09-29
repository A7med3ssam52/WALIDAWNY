import { useState } from 'react';
import { Link } from 'react-router-dom';

import { BrandIcon } from '../../../components/BrandIcon';
import { SeoHead } from '../../../components/SeoHead';
import { LAB_GRADES } from './authLabsData';
import { MockField, MockShell, MockSubmit } from './mockKit';

/**
 * Labs auth variant 5 — bold app-like language, thumb-friendly CTAs.
 * UI mock only: no backend, no persistence, noindex.
 */

function AppFrame({
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
        title={`معمل التصميم 5 — ${title}`}
        description="اقتراح تصميم لصفحات الدخول والتسجيل — عرض تجريبي"
        canonicalPath={path}
        noIndex
      />
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-8">
        <div className="flex items-center gap-2">
          <BrandIcon className="h-9 w-9" />
          <span className="font-display text-base font-black text-foreground">وليد عونى</span>
          <span className="ms-auto rounded-full bg-primary-soft px-3 py-1 text-[11px] font-black text-primary-strong">
            {kicker}
          </span>
        </div>
        <h1 className="mt-8 font-display text-4xl font-black leading-[1.3] text-foreground">{title}</h1>
        <p className="mt-2 text-base text-foreground-muted">{subtitle}</p>
        <main className="mt-6 flex-1">{children}</main>
        <div className="mt-6 text-center">{footer}</div>
      </div>
    </MockShell>
  );
}

export function Login5() {
  return (
    <AppFrame
      testId="labs-login5"
      path="/labs/login5"
      kicker="اقتراح 5"
      title="يلا نكمل مذاكرة"
      subtitle="ادخل حسابك وارجع لخطتك"
      footer={
        <Link
          to="/labs/register5"
          className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-border bg-surface px-6 text-sm font-bold text-foreground"
        >
          معنديش حساب — إنشاء حساب جديد
        </Link>
      }
    >
      <MockSubmit testId="labs-login5-submit" large submitLabel="تسجيل الدخول">
        <MockField label="البريد الإلكتروني" name="email" type="email" dir="ltr" placeholder="you@example.com" />
        <MockField label="كلمة المرور" name="password" type="password" />
      </MockSubmit>
    </AppFrame>
  );
}

export function Register5() {
  const [gradeId, setGradeId] = useState('');
  const [accepted, setAccepted] = useState(false);
  return (
    <AppFrame
      testId="labs-register5"
      path="/labs/register5"
      kicker="اقتراح 5"
      title="اعمل حسابك في دقيقة"
      subtitle="اختار صفك وابدأ فوراً"
      footer={
        <Link
          to="/labs/login5"
          className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-border bg-surface px-6 text-sm font-bold text-foreground"
        >
          عندي حساب — تسجيل الدخول
        </Link>
      }
    >
      <MockSubmit testId="labs-register5-submit" large submitLabel="إنشاء الحساب">
        <MockField label="الاسم بالكامل" name="fullName" placeholder="مثال: أحمد محمد" />
        <div className="grid gap-4 sm:grid-cols-2">
          <MockField label="رقم الهاتف" name="phone" type="tel" dir="ltr" placeholder="01xxxxxxxxx" />
          <MockField label="هاتف ولي الأمر" name="guardianPhone" type="tel" dir="ltr" placeholder="01xxxxxxxxx" />
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-bold text-foreground">اختار صفك</span>
          <div className="grid gap-2" role="group" aria-label="الصف الدراسي">
            {LAB_GRADES.map((grade) => {
              const active = gradeId === grade.id;
              return (
                <button
                  key={grade.id}
                  type="button"
                  data-testid={`labs-register5-grade-${grade.id}`}
                  aria-pressed={active}
                  onClick={() => setGradeId(grade.id)}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-start transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong ${
                    active
                      ? 'border-primary-strong bg-primary-soft'
                      : 'border-border bg-surface hover:border-primary/50'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-black ${
                      active ? 'btn-primary border-transparent' : 'border-border text-foreground-subtle'
                    }`}
                  >
                    {active ? '✓' : ''}
                  </span>
                  <span className="text-sm font-bold text-foreground">{grade.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        <MockField label="كلمة المرور" name="password" type="password" hint="6 أحرف على الأقل" />
        <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-foreground-muted">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          أوافق على الشروط والأحكام وسياسة الخصوصية (عرض تجريبي)
        </label>
      </MockSubmit>
    </AppFrame>
  );
}
