import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { StudentNav } from '../../components/StudentNav';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';
import { getSupabaseClient } from '../../lib/supabase';
import {
  PASSWORD_MIN_LENGTH,
  validatePasswordChange,
  type PasswordChangeValues,
} from '../../lib/validation';
import { useAuth } from '../auth/AuthContext';

const emptyForm: PasswordChangeValues = {
  newPassword: '',
  confirmPassword: '',
};

function needsSessionRestore(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('auth session missing') ||
    normalized.includes('reauthentication') ||
    normalized.includes('re-authenticated') ||
    normalized.includes('session expired') ||
    normalized.includes('session not found') ||
    normalized.includes('invalid refresh token')
  );
}

export function StudentChangePasswordPage() {
  const { showToast } = useToast();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<PasswordChangeValues>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof PasswordChangeValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validatePasswordChange(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await getSupabaseClient().auth.updateUser({ password: form.newPassword });
      if (error) {
        if (needsSessionRestore(errorMessage(error))) {
          try {
            await signOut();
          } catch {
            // state is cleared best-effort; still send the user back to login
          }
          navigate('/login', { replace: true });
          showToast('انتهت صلاحية الجلسة — يرجى تسجيل الدخول مرة أخرى لتغيير كلمة المرور', 'error');
          return;
        }
        throw error;
      }
      showToast('تم تغيير كلمة المرور بنجاح');
      setForm(emptyForm);
    } catch {
      showToast('تعذر تغيير كلمة المرور. حاول مرة أخرى لاحقًا', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LayoutShell title="تغيير كلمة المرور" variant="sidebar" nav={<StudentNav />}>
      <div className="mx-auto max-w-2xl">
        <Card title="كلمة المرور" subtitle="احتفظ بكلمة مرور قوية لحماية حسابك">
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="كلمة المرور الجديدة"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                hint={`${PASSWORD_MIN_LENGTH} أحرف على الأقل`}
                value={form.newPassword}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, newPassword: event.target.value }))
                }
                error={errors.newPassword}
              />
              <Input
                label="تأكيد كلمة المرور الجديدة"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                }
                error={errors.confirmPassword}
              />
            </div>
            <div>
              <Button type="submit" loading={submitting}>
                تغيير كلمة المرور
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </LayoutShell>
  );
}
