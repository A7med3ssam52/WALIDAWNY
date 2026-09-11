import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Eye, X } from 'lucide-react';

import { RoleNav } from '../../components/RoleNav';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { Select } from '../../components/Select';
import { Textarea } from '../../components/Textarea';
import { Toggle } from '../../components/Toggle';
import { useToast } from '../../components/Toast';
import { createAnnouncement, updateAnnouncement, getAnnouncementById } from '../../lib/announcements';
import type { Announcement, CreateAnnouncementInput, AnnouncementVariant, UserRole } from '../../lib/announcements';

const VARIANT_OPTIONS: Array<{ value: AnnouncementVariant; label: string }> = [
  { value: 'info', label: 'معلومات (أزرق)' },
  { value: 'warning', label: 'تحذير (برتقالي)' },
  { value: 'success', label: 'نجاح (أخضر)' },
  { value: 'error', label: 'خطأ (أحمر)' },
];

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'student', label: 'طالب' },
  { value: 'teacher', label: 'مدرس' },
  { value: 'mr_walid', label: 'الأستاذ وليد' },
  { value: 'admin', label: 'مشرف' },
  { value: 'assistant', label: 'مساعد' },
];

interface FormData {
  title: string;
  body: string;
  link_url: string;
  link_label: string;
  variant: AnnouncementVariant;
  target_roles: UserRole[];
  hide_on_paths: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  dismissible: boolean;
}

const initialForm: FormData = {
  title: '',
  body: '',
  link_url: '',
  link_label: '',
  variant: 'info',
  target_roles: ['student', 'teacher', 'mr_walid', 'admin'],
  hide_on_paths: '',
  starts_at: new Date().toISOString().slice(0, 16),
  ends_at: '',
  is_active: true,
  dismissible: true,
};

export function WalidAnnouncementFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const { showToast } = useToast();

  const [form, setForm] = useState<FormData>(initialForm);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!isEdit);
  const [showPreview, setShowPreview] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(false);
    try {
      const ann = await getAnnouncementById(id);
      setForm({
        title: ann.title,
        body: ann.body,
        link_url: ann.link_url ?? '',
        link_label: ann.link_label ?? '',
        variant: ann.variant,
        target_roles: ann.target_roles,
        hide_on_paths: ann.hide_on_paths.join(', '),
        starts_at: ann.starts_at.slice(0, 16),
        ends_at: ann.ends_at ? ann.ends_at.slice(0, 16) : '',
        is_active: ann.is_active,
        dismissible: ann.dismissible,
      });
      setLoaded(true);
    } catch {
      setLoadError(true);
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => {
    if (isEdit) void load();
  }, [isEdit, load]);

  const handleChange = (field: keyof FormData, value: string | boolean | UserRole[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRoleToggle = (role: UserRole) => {
    setForm((prev) => ({
      ...prev,
      target_roles: prev.target_roles.includes(role)
        ? prev.target_roles.filter((r) => r !== role)
        : [...prev.target_roles, role],
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedLinkUrl = form.link_url.trim() || null;
    if (trimmedLinkUrl && !trimmedLinkUrl.startsWith('https://')) {
      showToast('رابط الزر يجب أن يبدأ بـ https://', 'error');
      return;
    }
    setBusy(true);
    try {
      const basePayload = {
        title: form.title.trim(),
        body: form.body.trim(),
        link_url: trimmedLinkUrl,
        link_label: form.link_label.trim() || null,
        variant: form.variant,
        target_roles: form.target_roles,
        hide_on_paths: form.hide_on_paths.split(',').map((s) => s.trim()).filter(Boolean),
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : new Date().toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        is_active: form.is_active,
        dismissible: form.dismissible,
      };

      if (isEdit && id) {
        await updateAnnouncement(id, basePayload);
        showToast('تم تحديث الإعلان');
      } else {
        await createAnnouncement(basePayload as CreateAnnouncementInput);
        showToast('تم إنشاء الإعلان');
      }
      navigate('/walid/announcements');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      // eslint-disable-next-line no-console
      console.error('[announcement save]', msg || err);
      showToast(isEdit ? 'تعذر التحديث' : 'تعذر الإنشاء', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    navigate('/walid/announcements');
  };

  if (!loaded) {
    return (
      <LayoutShell
        title={isEdit ? 'تعديل الإعلان' : 'إنشاء إعلان جديد'}
        variant="sidebar"
        nav={<RoleNav />}
      >
        <div className="flex flex-col gap-3" aria-hidden="true" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="glass-card p-4 animate-pulse" />
          ))}
        </div>
      </LayoutShell>
    );
  }

  if (loadError) {
    return (
      <LayoutShell
        title={isEdit ? 'تعديل الإعلان' : 'إنشاء إعلان جديد'}
        variant="sidebar"
        nav={<RoleNav />}
      >
        <ErrorState
          message={isEdit ? 'تعذر تحميل الإعلان' : 'تعذر تحميل الصفحة'}
          onRetry={() => (isEdit ? void load() : window.location.reload())}
        />
      </LayoutShell>
    );
  }

  const previewAnnouncement: Announcement = {
    id: 'preview',
    title: form.title || 'عنوان الإعلان',
    body: form.body || 'محتوى الإعلان...',
    link_url: form.link_url || null,
    link_label: form.link_label || null,
    variant: form.variant,
    target_roles: form.target_roles,
    hide_on_paths: form.hide_on_paths.split(',').map((s) => s.trim()).filter(Boolean),
    starts_at: form.starts_at,
    ends_at: form.ends_at || null,
    is_active: form.is_active,
    dismissible: form.dismissible,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return (
    <LayoutShell
      title={isEdit ? `تعديل: ${form.title || '...'}` : 'إنشاء إعلان جديد'}
      subtitle="المعاينة تظهر أدناه — سيظهر الإعلان عالمياً حسب الاستهداف والجدولة"
      variant="sidebar"
      nav={<RoleNav />}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={handleCancel}
            disabled={busy}
          >
            رجوع
          </Button>
          <Button
            variant={showPreview ? 'secondary' : 'primary'}
            icon={showPreview ? <X className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? 'إخفاء المعاينة' : 'معاينة'}
          </Button>
          <Button
            type="submit"
            form="announcement-form"
            loading={busy}
            icon={<Save className="h-4 w-4" />}
          >
            {isEdit ? 'حفظ التغييرات' : 'إنشاء الإعلان'}
          </Button>
        </div>
      }
    >
      <form id="announcement-form" onSubmit={handleSubmit} className="space-y-6">
        <Card title="محتوى الإعلان">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="العنوان *"
              name="title"
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              required
              maxLength={120}
              placeholder="عنوان قصير وجذاب"
            />
            <Select
              label="النوع *"
              name="variant"
              value={form.variant}
              onChange={(e) => handleChange('variant', e.target.value as AnnouncementVariant)}
            >
              {VARIANT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>

          <Textarea
            label="المحتوى *"
            name="body"
            value={form.body}
            onChange={(e) => handleChange('body', e.target.value)}
            required
            rows={4}
            placeholder="نص الإعلان..."
            className="mt-2"
          />

          <div className="grid gap-4 sm:grid-cols-2 mt-2">
            <Input
              label="رابط الزر (اختياري)"
              name="link_url"
              type="url"
              value={form.link_url}
              onChange={(e) => handleChange('link_url', e.target.value)}
              placeholder="https://example.com"
            />
            <Input
              label="نص الزر (اختياري)"
              name="link_label"
              value={form.link_label}
              onChange={(e) => handleChange('link_label', e.target.value)}
              placeholder="اقرأ المزيد"
            />
          </div>
        </Card>

        <Card title="الاستهداف والجدولة">
          <fieldset className="space-y-3">
            <legend className="font-medium text-foreground">الجمهور المستهدف</legend>
            <div className="flex flex-wrap gap-3">
              {ROLE_OPTIONS.map((role) => (
                <label key={role.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.target_roles.includes(role.value)}
                    onChange={() => handleRoleToggle(role.value)}
                    className="h-4 w-4 rounded border-border-accent text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-foreground">{role.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2 mt-4">
            <Input
              label="تاريخ البدء *"
              name="starts_at"
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => handleChange('starts_at', e.target.value)}
              required
            />
            <Input
              label="تاريخ الانتهاء (اختياري)"
              name="ends_at"
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => handleChange('ends_at', e.target.value)}
            />
          </div>

          <Input
            label="مسارات الإخفاء (اختياري، مفصولة بفواصل)"
            name="hide_on_paths"
            type="text"
            value={form.hide_on_paths}
            onChange={(e) => handleChange('hide_on_paths', e.target.value)}
            placeholder="/student/dashboard, /login"
            className="mt-4"
            hint="هذه المسارات لن يظهر فيها الإعلان."
          />

          <div className="flex flex-wrap items-center gap-4 mt-4">
            <Toggle
              name="is_active"
              checked={form.is_active}
              onChange={(checked) => handleChange('is_active', checked)}
              label="نشط"
            />
            <Toggle
              name="dismissible"
              checked={form.dismissible}
              onChange={(checked) => handleChange('dismissible', checked)}
              label="قابل للإخفاء"
            />
          </div>
        </Card>

        {showPreview && (
          <Card title="معاينة مباشرة" subtitle="هذا كيف سيظهر الشريط عالمياً">
            <div className="p-2 bg-black/20 rounded-lg">
              <AnnouncementPreview announcement={previewAnnouncement} />
            </div>
          </Card>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-border-muted">
          <Button
            type="button"
            variant="secondary"
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={handleCancel}
            disabled={busy}
          >
            إلغاء
          </Button>
          <Button
            type="submit"
            loading={busy}
            icon={<Save className="h-4 w-4" />}
          >
            {isEdit ? 'حفظ التغييرات' : 'إنشاء الإعلان'}
          </Button>
        </div>
      </form>
    </LayoutShell>
  );
}

function AnnouncementPreview({ announcement }: { announcement: Announcement }) {
  const variantStyles: Record<AnnouncementVariant, string> = {
    info: 'from-blue-500 to-blue-600 border-blue-400/30',
    warning: 'from-amber-500 to-amber-600 border-amber-400/30',
    success: 'from-emerald-500 to-emerald-600 border-emerald-400/30',
    error: 'from-red-500 to-red-600 border-red-400/30',
  };

  const style = variantStyles[announcement.variant] ?? variantStyles.info;

  const variantIcons: Record<AnnouncementVariant, ReactElement> = {
    info: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="2"/><path d="M12 16v-4M12 8h.01" strokeWidth="2" strokeLinecap="round"/></svg>,
    warning: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeWidth="2"/><path d="M12 9v4M12 17h.01" strokeWidth="2" strokeLinecap="round"/></svg>,
    success: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeWidth="2"/><polyline points="22 4 12 14.01 9 11.01" strokeWidth="2"/></svg>,
    error: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="2"/><line x1="15" y1="9" x2="9" y2="15" strokeWidth="2"/><line x1="9" y1="9" x2="15" y2="15" strokeWidth="2"/></svg>,
  };

  const Icon = variantIcons[announcement.variant] ?? variantIcons.info;

  return (
    <div className="relative flex min-h-[320px] items-center justify-center rounded-xl bg-black/50 p-4 backdrop-blur-sm" dir="rtl">
      <div className={`relative w-full max-w-lg rounded-2xl border p-6 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)] text-white bg-gradient-to-r ${style}`}>
        {announcement.dismissible && (
          <span className="absolute left-3 top-3 rounded-lg p-1.5 text-white/70" aria-hidden="true">
            <X className="h-4 w-4" />
          </span>
        )}

        <div className="flex flex-col items-center text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15" aria-hidden="true">
            {Icon}
          </span>
          <p className="mt-4 text-lg font-bold leading-snug">{announcement.title}</p>
          <p className="mt-2 text-sm leading-6 text-white/90 whitespace-pre-wrap">{announcement.body}</p>

          {announcement.link_url && announcement.link_label && /^https:\/\//.test(announcement.link_url) && (
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-gray-900 shadow-lg">
              {announcement.link_label}
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="15 3 21 3 21 9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="10" y1="14" x2="21" y2="3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}

          {announcement.dismissible ? (
            <span className="mt-5 inline-flex min-w-[140px] items-center justify-center rounded-xl bg-white/20 px-6 py-2.5 text-sm font-bold text-white">
              فهمت
            </span>
          ) : (
            <span className="mt-4 text-xs text-white/70">سيختفي تلقائياً عند انتهاء المدة</span>
          )}
        </div>
      </div>
    </div>
  );
}