import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, CheckCheck } from 'lucide-react';

import { AdminNav } from '../../components/AdminNav';
import { AvatarImage } from '../../components/AvatarImage';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import {
  getProfileById,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type { AppNotification, Profile } from '../../types/database';

/**
 * Admin inbox for student avatar changes (0087 `avatar_updated`).
 * One row per change: student name + photo preview + time + link
 * to the student detail page. Admin role only (/admin/* guard).
 */
export function AdminNotificationsPage() {
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile | null>>({});
  const [error, setError] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const rows = (await listMyNotifications()).filter((row) => row.type === 'avatar_updated');
      setNotifications(rows);
      const ids = [...new Set(rows.map((row) => row.entity_id).filter((id): id is string => Boolean(id)))];
      const entries = await Promise.all(
        ids.map(async (id) => [id, await getProfileById(id).catch(() => null)] as const),
      );
      setProfiles(Object.fromEntries(entries));
    } catch {
      setError(true);
      setNotifications([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpen = async (notification: AppNotification) => {
    if (!notification.is_read) {
      try {
        await markNotificationRead(notification.id);
        setNotifications((prev) =>
          (prev ?? []).map((row) => (row.id === notification.id ? { ...row, is_read: true } : row)),
        );
      } catch {
        showToast('تعذر تعليم الإشعار كمقروء', 'error');
      }
    }
  };

  const handleMarkAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => (prev ?? []).map((row) => ({ ...row, is_read: true })));
      showToast('تم تعليم كل الإشعارات كمقروءة');
    } catch {
      showToast('تعذر تعليم الإشعارات كمقروءة', 'error');
    } finally {
      setMarkingAll(false);
    }
  };

  const unread = (notifications ?? []).filter((row) => !row.is_read).length;

  return (
    <LayoutShell
      title="إشعارات الصور الشخصية"
      subtitle="تنبيه بكل تغيير لصورة طالب — للمراجعة والتحميل"
      variant="sidebar"
      nav={<AdminNav />}
      actions={
        unread > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<CheckCheck aria-hidden="true" className="h-4 w-4" />}
            loading={markingAll}
            onClick={() => void handleMarkAll()}
          >
            تعليم الكل كمقروء
          </Button>
        ) : undefined
      }
    >
      {error ? (
        <ErrorState message="تعذر تحميل الإشعارات" onRetry={() => void load()} />
      ) : notifications === null ? (
        <div className="flex flex-col gap-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="لا توجد إشعارات صور بعد"
          description="عندما يرفع طالب صورته الشخصية أو يغيرها سيصلك تنبيه هنا."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {notifications.map((notification) => {
            const student = notification.entity_id ? profiles[notification.entity_id] : null;
            const name = student?.full_name ?? notification.body ?? 'طالب';
            return (
              <Card key={notification.id}>
                <article
                  data-testid={`admin-notification-${notification.id}`}
                  data-unread={!notification.is_read}
                  className="flex items-center gap-3"
                >
                  <AvatarImage
                    path={student?.avatar_path}
                    alt={`صورة ${name}`}
                    className="h-14 w-14 shrink-0 rounded-full ring-2 ring-border"
                    fallback={
                      <span
                        aria-hidden="true"
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xl font-black text-primary-strong"
                      >
                        {name.trim().charAt(0) || 'ط'}
                      </span>
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-foreground">
                        {notification.title} — {name}
                      </p>
                      {!notification.is_read ? (
                        <Badge variant="info">جديد</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-foreground-subtle">
                      {formatDateTime(notification.created_at)}
                    </p>
                  </div>
                  {notification.entity_id ? (
                    <Link
                      to={`/walid/students/${notification.entity_id}`}
                      onClick={() => void handleOpen(notification)}
                      aria-label={`عرض ${name}`}
                      className="inline-flex h-10 shrink-0 items-center rounded-xl bg-primary-soft px-4 text-xs font-black text-primary-strong transition-colors hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                    >
                      عرض الطالب
                    </Link>
                  ) : null}
                </article>
              </Card>
            );
          })}
        </div>
      )}
      {unread > 0 ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-foreground-subtle">
          <BellRing aria-hidden="true" className="h-4 w-4" />
          لديك {unread} إشعار غير مقروء
        </p>
      ) : null}
    </LayoutShell>
  );
}
