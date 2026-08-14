import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCircle2, KeyRound, User } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { Skeleton } from '../../components/Skeleton';
import { StudentNav } from '../../components/StudentNav';
import { WhatsAppIcon } from '../../components/WhatsAppIcon';
import { getMyCurrentSubscription, getPublicSettings, listMyNotifications } from '../../data/rpc';
import { buildWhatsAppLink, formatDate } from '../../lib/format';
import type { PublicSettings, SubscriptionWithPlan } from '../../types/database';
import { useAuth } from '../auth/AuthContext';

export function StudentDashboardPage() {
  const { profile, user } = useAuth();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [settingsError, setSettingsError] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null | undefined>(
    undefined,
  );
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    let active = true;
    listMyNotifications()
      .then((rows) => {
        if (active) {
          setUnreadNotifications(rows.filter((row) => !row.is_read).length);
        }
      })
      .catch(() => {
        // the unread badge is informational; failure is non-fatal
      });
    return () => {
      active = false;
    };
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsError(false);
    try {
      setSettings(await getPublicSettings());
    } catch {
      setSettingsError(true);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    let active = true;
    getMyCurrentSubscription()
      .then((value) => {
        if (active) {
          setSubscription(value);
        }
      })
      .catch(() => {
        if (active) {
          setSubscription(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const displayName = profile?.full_name ?? user?.email ?? '';

  return (
    <LayoutShell
      title="لوحة الطالب"
      subtitle={displayName ? `مرحبًا، ${displayName}` : undefined}
      variant="sidebar" nav={<StudentNav />}
    >
      <div className="flex flex-col gap-4">
        <Card title="اشتراكك">
          {subscription ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                اشتراك نشط حتى {formatDate(subscription.expires_at)}
              </Badge>
              <Link
                to="/student/subscriptions"
                className="rounded-sm text-sm font-medium text-primary-strong transition-colors hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
              >
                عرض التفاصيل
              </Link>
            </div>
          ) : subscription === null ? (
            <Link
              to="/student/subscriptions"
              className="inline-block rounded-full transition-colors hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
            >
              <Badge variant="warning" outline>
                تفعيل اشتراك
              </Badge>
            </Link>
          ) : (
            <div className="flex flex-col gap-3" aria-hidden="true">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          )}
        </Card>
        <Card title="ملخص حسابك">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-foreground-subtle">البريد الإلكتروني</dt>
              <dd className="text-sm text-foreground" dir="ltr">
                {user?.email ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-subtle">رقم الهاتف</dt>
              <dd className="text-sm text-foreground" dir="ltr">
                {profile?.phone ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-subtle">هاتف ولي الأمر</dt>
              <dd className="text-sm text-foreground" dir="ltr">
                {profile?.guardian_phone ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-subtle">العنوان</dt>
              <dd className="text-sm text-foreground">{profile?.address ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-subtle">الحالة</dt>
              <dd className="text-sm text-foreground">
                {profile?.status === 'disabled' ? 'موقوف' : 'نشط'}
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="روابط سريعة">
          <div className="flex flex-wrap gap-3">
            <Link
              to="/student/notifications"
              data-testid="notifications-link"
              className="relative inline-flex items-center gap-2 rounded-md border border-white/12 bg-white/4 px-4 py-2.5 text-sm font-medium text-foreground-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all hover:border-primary/40 hover:bg-white/8 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
            >
              <Bell aria-hidden="true" className="h-4 w-4" />
              الإشعارات
              {unreadNotifications > 0 ? (
                <span
                  className="absolute -top-2 -start-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-xs font-bold text-white"
                  data-testid="unread-count"
                >
                  {unreadNotifications}
                </span>
              ) : null}
            </Link>
            <Link
              to="/student/profile"
              className="inline-flex items-center gap-2 rounded-md border border-white/12 bg-white/4 px-4 py-2.5 text-sm font-medium text-foreground-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all hover:border-primary/40 hover:bg-white/8 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
            >
              <User aria-hidden="true" className="h-4 w-4" />
              تعديل الملف الشخصي
            </Link>
            <Link
              to="/student/password"
              className="inline-flex items-center gap-2 rounded-md border border-white/12 bg-white/4 px-4 py-2.5 text-sm font-medium text-foreground-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all hover:border-primary/40 hover:bg-white/8 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
            >
              <KeyRound aria-hidden="true" className="h-4 w-4" />
              تغيير كلمة المرور
            </Link>
          </div>
        </Card>

        {settingsError ? (
          <ErrorState
            message="تعذر تحميل إعدادات المنصة"
            onRetry={() => void loadSettings()}
          />
        ) : settings?.whatsapp_number ? (
          <Card title="تواصل مع الأستاذ" subtitle="لأي استفسار يمكنك التواصل مباشرة عبر واتساب">
            <a
              href={buildWhatsAppLink(settings.whatsapp_number, settings.whatsapp_default_message)}
              target="_blank"
              rel="noreferrer"
              className="btn-primary inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              <WhatsAppIcon size={18} />
              فتح محادثة واتساب
            </a>
          </Card>
        ) : null}
      </div>
    </LayoutShell>
  );
}
