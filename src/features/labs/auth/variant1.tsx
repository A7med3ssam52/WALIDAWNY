import { useState } from 'react';
import { Link } from 'react-router-dom';

import { BrandIcon } from '../../../components/BrandIcon';
import { SeoHead } from '../../../components/SeoHead';
import { LAB_VALUE_PROPS } from './authLabsData';
import { MockField, MockGradeChips, MockShell, MockSubmit } from './mockKit';

/**
 * Labs auth variant 1 — classic split (sidebar + form).
 * UI mock only: no backend, no persistence, noindex.
 */

function SplitFrame({
  testId,
  title,
  subtitle,
  children,
}: {
  testId: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <MockShell testId={testId}>
      <SeoHead
        title={`معمل التصميم 1 — ${title}`}
        description="اقتراح تصميم لصفحات الدخول والتسجيل — عرض تجريبي"
        canonicalPath={testId.includes('login') ? '/labs/login1' : '/labs/register1'}
        noIndex
      />
      <div className="flex min-h-screen">
        <aside className="m-4 hidden w-[42%] max-w-xl flex-col justify-between overflow-hidden rounded-[20px] bg-sidebar p-10 text-sidebar-foreground lg:flex">
          <div className="flex items-center gap-3">
            <BrandIcon className="h-11 w-11" />
            <div>
              <span className="block font-display text-lg font-bold text-sidebar-foreground">
                وليد عونى
              </span>
              <span className="mt-0.5 block text-xs text-sidebar-muted">تعلّم. تابع. تواصل.</span>
            </div>
          </div>
          <ul className="flex flex-col gap-6">
            {LAB_VALUE_PROPS.map((item) => (
              <li key={item.title} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"
                >
                  <item.Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-sidebar-foreground">{item.title}</span>
                  <span className="mt-1 block text-sm leading-6 text-sidebar-muted">
                    {item.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-sidebar-muted">
            © {new Date().getFullYear()} وليد عونى — عرض تجريبي
          </p>
        </aside>
        <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
          <div className="glass-card w-full max-w-md p-6 sm:p-8">
            <h1 className="font-display text-2xl font-black text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
        </main>
      </div>
    </MockShell>
  );
}

export function Login1() {
  return (
    <SplitFrame testId="labs-login1" title="تسجيل الدخول" subtitle="مرحبًا بعودتك إلى وليد عونى">
      <MockSubmit testId="labs-login1-submit" submitLabel="تسجيل الدخول">
        <MockField label="البريد الإلكتروني" name="email" type="email" dir="ltr" placeholder="you@example.com" />
        <MockField label="كلمة المرور" name="password" type="password" />
      </MockSubmit>
      <p className="mt-4 text-center text-sm text-foreground-muted">
        ليس لديك حساب؟{' '}
        <Link to="/labs/register1" className="font-semibold text-primary-strong hover:underline">
          إنشاء حساب جديد
        </Link>
      </p>
    </SplitFrame>
  );
}

export function Register1() {
  const [gradeId, setGradeId] = useState('');
  return (
    <SplitFrame testId="labs-register1" title="إنشاء حساب جديد" subtitle="ابدأ رحلتك التعليمية في دقيقة">
      <MockSubmit testId="labs-register1-submit" submitLabel="إنشاء الحساب">
        <MockField label="الاسم بالكامل" name="fullName" placeholder="مثال: أحمد محمد" />
        <MockField label="رقم الهاتف" name="phone" type="tel" dir="ltr" placeholder="01xxxxxxxxx" />
        <MockField label="رقم هاتف ولي الأمر" name="guardianPhone" type="tel" dir="ltr" placeholder="01xxxxxxxxx" />
        <MockGradeChips value={gradeId} onChange={setGradeId} testPrefix="labs-register1" />
        <MockField label="كلمة المرور" name="password" type="password" hint="6 أحرف على الأقل" />
        <MockField label="تأكيد كلمة المرور" name="confirmPassword" type="password" />
      </MockSubmit>
      <p className="mt-4 text-center text-sm text-foreground-muted">
        لديك حساب بالفعل؟{' '}
        <Link to="/labs/login1" className="font-semibold text-primary-strong hover:underline">
          تسجيل الدخول
        </Link>
      </p>
    </SplitFrame>
  );
}
