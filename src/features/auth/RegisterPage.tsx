import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';

import { BrandIcon } from '../../components/BrandIcon';
import { Button } from '../../components/Button';
import { GuestOnly } from '../../components/guards';
import { Input } from '../../components/Input';
import { SeoHead } from '../../components/SeoHead';
import { useToast } from '../../components/Toast';
import { listActiveGrades, type ActiveGrade } from '../../data/rpc';
import { errorMessage } from '../../lib/errors';
import { getSupabaseClient } from '../../lib/supabase';
import { SEO } from '../../lib/seo';
import {
  PASSWORD_MIN_LENGTH,
  toCanonicalPhone,
  validateRegister,
  type RegisterFormValues,
} from '../../lib/validation';
import { useAuth } from './AuthContext';

const emptyForm: RegisterFormValues = {
  fullName: '',
  email: '',
  phone: '',
  guardianPhone: '',
  address: '',
  gradeId: '',
  password: '',
  confirmPassword: '',
};

const TERMS_ERROR = 'يجب الموافقة على الشروط والأحكام أولاً';

function toRegisterErrorMessage(error: unknown): string {
  const message = errorMessage(error).toLowerCase();
  if (message.includes('already registered') || message.includes('user_already_exists')) {
    return 'هذا البريد الإلكتروني مسجل بالفعل. يمكنك تسجيل الدخول مباشرة';
  }
  if (message.includes('password') || message.includes('weak_password')) {
    return `كلمة المرور يجب أن تكون ${PASSWORD_MIN_LENGTH} أحرف على الأقل`;
  }
  if (message.includes('profile_meta_required')) {
    return 'حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة مرة أخرى';
  }
  if (message.includes('grade_required')) {
    return 'يجب اختيار الصف الدراسي';
  }
  if (message.includes('grade_not_available')) {
    return 'الصف الدراسي المختار غير متاح حاليًا';
  }
  if (message.includes('invalid_grade_id')) {
    return 'حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة مرة أخرى';
  }
  if (
    message.includes('rate limit') ||
    message.includes('rate_limit') ||
    message.includes('security purposes') ||
    message.includes('after 30 seconds') ||
    /after \d+ seconds/.test(message)
  ) {
    return 'تم إرسال عدد كبير من الطلبات. حاول مرة أخرى بعد قليل';
  }
  return 'تعذر إنشاء الحساب. حاول مرة أخرى لاحقًا';
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { refreshProfile } = useAuth();

  const [form, setForm] = useState<RegisterFormValues>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [grades, setGrades] = useState<ActiveGrade[] | null>(null);
  const [gradesError, setGradesError] = useState(false);

  const loadGrades = async () => {
    setGradesError(false);
    try {
      setGrades(await listActiveGrades());
    } catch {
      setGradesError(true);
      setGrades([]);
    }
  };

  useEffect(() => {
    void loadGrades();
  }, []);

  const updateField = (field: keyof RegisterFormValues) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setTermsError(null);
    const nextErrors = validateRegister(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    if (!termsAccepted) {
      setTermsError(TERMS_ERROR);
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await getSupabaseClient().auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            full_name: form.fullName.trim(),
            phone: toCanonicalPhone(form.phone),
            guardian_phone: toCanonicalPhone(form.guardianPhone),
            address: form.address.trim(),
            grade_id: form.gradeId,
          },
        },
      });
      if (error) {
        throw error;
      }
      if (data.session) {
        await refreshProfile();
        showToast('تم إنشاء الحساب بنجاح');
        navigate('/', { replace: true });
      } else {
        setNeedsEmailConfirmation(true);
      }
    } catch (error) {
      const message = toRegisterErrorMessage(error);
      setFormError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (needsEmailConfirmation) {
    return (
      <GuestOnly>
        <SeoHead title={SEO.register.title} description={SEO.register.description} canonicalPath="/register" noIndex />
        <div dir="rtl" className="min-h-screen bg-background text-foreground">
          <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-4 py-8 text-center">
            <span
              aria-hidden="true"
              className="card-chip inline-flex h-16 w-16 items-center justify-center rounded-2xl"
            >
              <MailCheck className="h-7 w-7" />
            </span>
            <h1 className="mt-4 font-display text-3xl font-black text-foreground">
              تم إنشاء حسابك بنجاح
            </h1>
            <p className="mt-2 max-w-md text-sm leading-7 text-foreground-muted">
              تم إرسال رابط التفعيل إلى بريدك الإلكتروني. يرجى تفعيل الحساب ثم تسجيل الدخول.
            </p>
            <Link
              to="/login"
              className="btn-primary mt-6 inline-flex h-13 w-full items-center justify-center rounded-2xl px-6 py-4 text-base font-black"
            >
              الذهاب إلى تسجيل الدخول
            </Link>
          </div>
        </div>
      </GuestOnly>
    );
  }

  return (
    <GuestOnly>
      <SeoHead title={SEO.register.title} description={SEO.register.description} canonicalPath="/register" noIndex />
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
              حساب جديد
            </span>
          </div>
          <h1 className="mt-8 font-display text-4xl font-black leading-[1.3] text-foreground">
            اعمل حسابك في دقيقة
          </h1>
          <p className="mt-2 text-base text-foreground-muted">اختار صفك وابدأ فوراً</p>
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
                label="الاسم الكامل"
                name="fullName"
                autoComplete="name"
                placeholder="مثال: أحمد محمد"
                value={form.fullName}
                onChange={(event) => updateField('fullName')(event.target.value)}
                error={errors.fullName}
              />
              <Input
                label="البريد الإلكتروني"
                name="email"
                type="email"
                dir="ltr"
                autoComplete="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(event) => updateField('email')(event.target.value)}
                error={errors.email}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="رقم الهاتف"
                  name="phone"
                  dir="ltr"
                  autoComplete="tel"
                  placeholder="01xxxxxxxxx"
                  value={form.phone}
                  onChange={(event) => updateField('phone')(event.target.value)}
                  error={errors.phone}
                />
                <Input
                  label="رقم هاتف ولي الأمر"
                  name="guardianPhone"
                  dir="ltr"
                  autoComplete="tel"
                  placeholder="01xxxxxxxxx"
                  value={form.guardianPhone}
                  onChange={(event) => updateField('guardianPhone')(event.target.value)}
                  error={errors.guardianPhone}
                />
              </div>
              <Input
                label="العنوان"
                name="address"
                autoComplete="street-address"
                placeholder="مثال: القاهرة"
                value={form.address}
                onChange={(event) => updateField('address')(event.target.value)}
                error={errors.address}
              />
              <div>
                <span className="mb-1.5 block text-sm font-bold text-foreground">اختار صفك</span>
                {grades === null ? (
                  <p className="text-sm text-foreground-subtle">جاري تحميل الصفوف...</p>
                ) : gradesError ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-error/30 bg-error/[0.06] px-3 py-2.5">
                    <p className="text-sm text-error">تعذر تحميل الصفوف</p>
                    <button
                      type="button"
                      onClick={() => void loadGrades()}
                      className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-primary-strong hover:underline"
                    >
                      إعادة المحاولة
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-2" role="group" aria-label="الصف الدراسي">
                    {grades.map((grade) => {
                      const active = form.gradeId === grade.id;
                      return (
                        <button
                          key={grade.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => updateField('gradeId')(grade.id)}
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
                )}
                {errors.gradeId ? (
                  <p role="alert" className="mt-1.5 animate-fade-in text-xs font-medium text-error">
                    {errors.gradeId}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="كلمة المرور"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  hint={`${PASSWORD_MIN_LENGTH} أحرف على الأقل`}
                  value={form.password}
                  onChange={(event) => updateField('password')(event.target.value)}
                  error={errors.password}
                />
                <Input
                  label="تأكيد كلمة المرور"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(event) => updateField('confirmPassword')(event.target.value)}
                  error={errors.confirmPassword}
                />
              </div>
              <div>
                <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-foreground-muted">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(event) => {
                      setTermsAccepted(event.target.checked);
                      setTermsError(null);
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span>
                    أوافق على{' '}
                    <Link to="/terms" className="font-bold text-primary-strong hover:underline">
                      الشروط والأحكام
                    </Link>{' '}
                    و{' '}
                    <Link to="/privacy" className="font-bold text-primary-strong hover:underline">
                      سياسة الخصوصية
                    </Link>
                  </span>
                </label>
                {termsError ? (
                  <p role="alert" className="mt-1.5 animate-fade-in text-xs font-medium text-error">
                    {termsError}
                  </p>
                ) : null}
              </div>
              <Button type="submit" loading={submitting} className="h-13 w-full rounded-2xl text-base">
                إنشاء حساب
              </Button>
            </form>
          </main>
          <div className="mt-6">
            <Link
              to="/login"
              className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-border bg-surface px-6 text-sm font-bold text-foreground"
            >
              عندي حساب — تسجيل الدخول
            </Link>
          </div>
        </div>
      </div>
    </GuestOnly>
  );
}
