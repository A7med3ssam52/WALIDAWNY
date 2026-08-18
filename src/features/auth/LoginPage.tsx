import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { GuestOnly } from '../../components/guards';
import { Input } from '../../components/Input';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';
import { validateLogin } from '../../lib/validation';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './AuthContext';

function toLoginErrorMessage(error: unknown): string {
  const message = errorMessage(error).toLowerCase();
  if (
    message.includes('account_inactive_or_deleted') ||
    message.includes('inactive') ||
    message.includes('deleted')
  ) {
    return 'تم إيقاف هذا الحساب. يرجى التواصل مع إدارة المنصة';
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
      <AuthLayout>
        <Card
          title="تسجيل الدخول"
          subtitle="مرحبًا بك في منصة وليد عونى التعليمية"
          className="conic-ring spotlight-card"
        >
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            {formError ? (
              <p
                role="alert"
                className="rounded-md border border-error/25 bg-error/5 px-3 py-2 text-sm leading-6 text-error"
              >
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
            <Button type="submit" loading={submitting}>
              تسجيل الدخول
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-foreground-muted">
            ليس لديك حساب؟{' '}
            <Link to="/register" className="font-semibold text-primary-strong hover:underline">
              إنشاء حساب جديد
            </Link>
          </p>
        </Card>
      </AuthLayout>
    </GuestOnly>
  );
}
