import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { GuestOnly } from '../../components/guards';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
import { listActiveGrades, type ActiveGrade } from '../../data/rpc';
import { errorMessage } from '../../lib/errors';
import { getSupabaseClient } from '../../lib/supabase';
import {
  PASSWORD_MIN_LENGTH,
  toCanonicalPhone,
  validateRegister,
  type RegisterFormValues,
} from '../../lib/validation';
import { AuthLayout } from './AuthLayout';
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
    const nextErrors = validateRegister(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
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
        <AuthLayout>
          <Card
            title="تم إنشاء حسابك بنجاح"
            className="conic-ring spotlight-card"
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <span
                aria-hidden="true"
                className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 text-primary-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
              >
                <MailCheck className="h-7 w-7" />
              </span>
              <p className="text-sm leading-6 text-foreground-muted">
                تم إرسال رابط التفعيل إلى بريدك الإلكتروني. يرجى تفعيل الحساب ثم تسجيل الدخول.
              </p>
              <Link
                to="/login"
                className="btn-primary inline-flex h-11 w-full items-center justify-center rounded-md px-6 text-sm font-semibold text-white"
              >
                الذهاب إلى تسجيل الدخول
              </Link>
            </div>
          </Card>
        </AuthLayout>
      </GuestOnly>
    );
  }

  return (
    <GuestOnly>
      <AuthLayout>
        <Card
          title="إنشاء حساب جديد"
          subtitle="سجّل بياناتك للانضمام إلى المنصة"
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
              label="الاسم الكامل"
              name="fullName"
              autoComplete="name"
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
              value={form.address}
              onChange={(event) => updateField('address')(event.target.value)}
              error={errors.address}
            />
            <Select
              label="الصف الدراسي"
              name="gradeId"
              value={form.gradeId}
              onChange={(event) => updateField('gradeId')(event.target.value)}
              error={errors.gradeId}
              required
            >
              <option value="" disabled>
                {grades === null
                  ? 'جاري تحميل الصفوف...'
                  : gradesError
                    ? 'تعذر تحميل الصفوف'
                    : 'اختر الصف الدراسي'}
              </option>
              {grades?.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.name}
                </option>
              ))}
            </Select>
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
            <Button type="submit" loading={submitting}>
              إنشاء حساب
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-foreground-muted">
            لديك حساب بالفعل؟{' '}
            <Link to="/login" className="font-semibold text-primary-strong hover:underline">
              تسجيل الدخول
            </Link>
          </p>
        </Card>
      </AuthLayout>
    </GuestOnly>
  );
}
