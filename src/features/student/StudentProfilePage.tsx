import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { Skeleton } from '../../components/Skeleton';
import { StudentNav } from '../../components/StudentNav';
import { useToast } from '../../components/Toast';
import { updateOwnProfile } from '../../data/rpc';
import { toCanonicalPhone, validateProfileForm, type ProfileFormValues } from '../../lib/validation';
import { useAuth } from '../auth/AuthContext';

const emptyForm: ProfileFormValues = {
  fullName: '',
  phone: '',
  guardianPhone: '',
  address: '',
};

export function StudentProfilePage() {
  const { loading, profile, user, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState<ProfileFormValues>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileFormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        fullName: profile.full_name,
        phone: profile.phone,
        guardianPhone: profile.guardian_phone,
        address: profile.address,
      });
    }
  }, [profile]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateProfileForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      await updateOwnProfile({
        fullName: form.fullName.trim(),
        phone: toCanonicalPhone(form.phone),
        guardianPhone: toCanonicalPhone(form.guardianPhone),
        address: form.address.trim(),
      });
      await refreshProfile();
      showToast('تم تحديث بياناتك بنجاح');
    } catch {
      showToast('تعذر تحديث البيانات. حاول مرة أخرى لاحقًا', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LayoutShell title="الملف الشخصي" variant="sidebar" nav={<StudentNav />}>
      <div className="mx-auto max-w-2xl">
        <Card title="بياناتي" subtitle="يمكنك تعديل بياناتك المسجلة لدى المنصة">
          {loading ? (
            <div className="flex flex-col gap-4" aria-hidden="true">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-40" />
            </div>
          ) : (
            <>
              <div className="glass-soft mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted">
                <Mail aria-hidden="true" className="h-4 w-4 shrink-0 text-foreground-subtle" />
                <span className="font-medium text-foreground">البريد الإلكتروني</span> (لا يمكن
                تعديله): <span dir="ltr">{user?.email ?? '—'}</span>
              </div>
              <form
                onSubmit={(event) => void handleSubmit(event)}
                className="flex flex-col gap-4"
                noValidate
              >
                <Input
                  label="الاسم الكامل"
                  name="fullName"
                  value={form.fullName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, fullName: event.target.value }))
                  }
                  error={errors.fullName}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="رقم الهاتف"
                    name="phone"
                    dir="ltr"
                    value={form.phone}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, phone: event.target.value }))
                    }
                    error={errors.phone}
                  />
                  <Input
                    label="رقم هاتف ولي الأمر (اختياري)"
                    name="guardianPhone"
                    dir="ltr"
                    value={form.guardianPhone}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, guardianPhone: event.target.value }))
                    }
                    error={errors.guardianPhone}
                  />
                </div>
                <Input
                  label="العنوان"
                  name="address"
                  value={form.address}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, address: event.target.value }))
                  }
                  error={errors.address}
                />
                <div className="flex items-center gap-3">
                  <Button type="submit" loading={submitting}>
                    حفظ التغييرات
                  </Button>
                  <Link
                    to="/student/password"
                    className="rounded-sm text-sm font-medium text-primary-strong transition-colors hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                  >
                    تغيير كلمة المرور
                  </Link>
                </div>
              </form>
            </>
          )}
        </Card>
      </div>
    </LayoutShell>
  );
}
