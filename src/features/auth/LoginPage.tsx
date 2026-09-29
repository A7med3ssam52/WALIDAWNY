import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { BrandIcon } from '../../components/BrandIcon';
import { Button } from '../../components/Button';
import { GuestOnly } from '../../components/guards';
import { Input } from '../../components/Input';
import { SeoHead } from '../../components/SeoHead';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';
import { SEO } from '../../lib/seo';
import { validateLogin } from '../../lib/validation';
import { useAuth } from './AuthContext';

function toLoginErrorMessage(error: unknown): string {
  const message = errorMessage(error).toLowerCase();
  if (
    message.includes('account_inactive_or_deleted') ||
    message.includes('inactive') ||
    message.includes('deleted')
  ) {
    return 'تم حذف هذا الحساب. يرجى التواصل مع إدارة المنصة';
  }
  if (message.includes('invalid login credentials') || message.includes('invalid_credentials')) {
    return 'بيانات الدخول غير صحيحة';
  }
  if (message.includes('not confirmed') || message.includes('email not confirmed')) {
    return 'يرجى تفعيل البريد الإلكتروني أولاً ثم إعادة المحاولة';
  }
  return 'تعذر تسجيل الدخول. حاول مرة أخرى لاحقًا';
}

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const nextErrors = validateLogin(email, password);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/', { replace: true });
    } catch (error) {
      const message = toLoginErrorMessage(error);
      setFormError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GuestOnly>
      <SeoHead title={SEO.login.title} description={SEO.login.description} canonicalPath="/login" noIndex />
      <div dir="rtl" className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-8">
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              aria-label="وليد عونى — الرئيسية"
            >
              <BrandIcon className="h-9 w-9" />
              <span className="font-display text-base font-black text-foreground">وليد عونى</span>
            </Link>
            <span className="ms-auto rounded-full bg-primary-soft px-3 py-1 text-[11px] font-black text-primary-strong">
              تسجيل الدخول
            </span>
          </div>
          <h1 className="mt-8 font-display text-4xl font-black leading-[1.3] text-foreground">
            يلا نكمل مذاكرة
          </h1>
          <p className="mt-2 text-base text-foreground-muted">ادخل حسابك وارجع لخطتك</p>
          <main className="mt-6 flex-1">
            <form
              onSubmit={(event) => void handleSubmit(event)}
              className="flex flex-col gap-4"
              noValidate
            >
              {formError ? (
                <p
                  role="alert"
                  className="flex items-center gap-2 rounded-xl border border-error/30 bg-error/[0.06] px-3 py-2.5 text-sm leading-6 font-medium text-error"
                >
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-error" />
                  {formError}
                </p>
              ) : null}
              <Input
                label="البريد الإلكتروني"
                name="email"
                type="email"
                dir="ltr"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={errors.email}
              />
              <Input
                label="كلمة المرور"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={errors.password}
              />
              <Button type="submit" loading={submitting} className="h-13 w-full rounded-2xl text-base">
                تسجيل الدخول
              </Button>
            </form>
          </main>
          <div className="mt-6">
            <Link
              to="/register"
              className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-border bg-surface px-6 text-sm font-bold text-foreground"
            >
              معنديش حساب — إنشاء حساب جديد
            </Link>
          </div>
        </div>
      </div>
    </GuestOnly>
  );
}
