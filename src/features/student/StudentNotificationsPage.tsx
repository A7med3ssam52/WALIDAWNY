import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { Skeleton } from '../../components/Skeleton';
import { StudentNav } from '../../components/StudentNav';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../data/rpc';
import { formatDate } from '../../lib/format';
import type { AppNotification } from '../../types/database';

const typeLabels: Record<string, string> = {
  unit_activated: 'تفعيل وحدة',
  new_content: 'محتوى جديد',
  system: 'النظام',
  exam_submitted: 'إجابة اختبار',
  exam_graded: 'نتيجة اختبار',
  lesson_comment: 'تعليق',
  comment_reply: 'رد على تعليق',
};

function NotificationsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="glass-card space-y-3 p-4 sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function StudentNotificationsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[] | undefined>(undefined);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setNotifications(await listMyNotifications());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpen = useCallback(
    async (notification: AppNotification) => {
      if (!notification.is_read) {
        const previous = notifications;
        setNotifications(
          previous?.map((row) => (row.id === notification.id ? { ...row, is_read: true } : row)) ??
            [],
        );
        try {
          await markNotificationRead(notification.id);
        } catch {
          showToast('تعذر تحديث حالة الإشعار', 'error');
        }
      }
      if (notification.entity_type === 'lesson' && notification.entity_id) {
        navigate(`/student/lessons/${notification.entity_id}`);
      }
    },
    [navigate, notifications, showToast],
  );

  const handleMarkAll = useCallback(async () => {
    setNotifications((previous) => previous?.map((row) => ({ ...row, is_read: true })) ?? []);
    try {
      await markAllNotificationsRead();
    } catch {
      showToast('تعذر تحديث الإشعارات', 'error');
    }
  }, [showToast]);

  if (error) {
    return (
      <LayoutShell title="الإشعارات" variant="sidebar" nav={<StudentNav />}>
        <ErrorState message="تعذر تحميل الإشعارات" onRetry={() => void load()} />
      </LayoutShell>
    );
  }

  if (notifications === undefined) {
    return (
      <LayoutShell title="الإشعارات" variant="sidebar" nav={<StudentNav />}>
        <NotificationsSkeleton />
      </LayoutShell>
    );
  }

  const unreadCount = notifications.filter((row) => !row.is_read).length;

  return (
    <LayoutShell
      title="الإشعارات"
      subtitle={
        unreadCount > 0 ? `لديك ${unreadCount} إشعار غير مقروء` : 'لا توجد إشعارات غير مقروءة'
      }
      variant="sidebar" nav={<StudentNav />}
    >
      <div className="flex flex-col gap-4">
        {unreadCount > 0 ? (
          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={() => void handleMarkAll()}
              data-testid="mark-all-read"
            >
              تحديد الكل كمقروء
            </Button>
          </div>
        ) : null}

        {notifications.length === 0 ? (
          <EmptyState
            title="لا توجد إشعارات"
            description="عندما يصدر محتوى جديد أو تحديثات لحسابك، ستظهر هنا."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => void handleOpen(notification)}
                  className={`w-full rounded-lg border p-4 text-start transition-all hover:bg-white/6 ${
                    notification.is_read
                      ? 'glass-tile border-white/12'
                      : 'bg-gradient-to-br from-primary/[0.13] to-accent/[0.15] border-primary/30 shadow-[0_0_28px_-10px_rgba(99,102,241,0.4)]'
                  }`}
                  data-testid={`notification-${notification.id}`}
                  data-unread={notification.is_read ? 'false' : 'true'}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">
                      {notification.title}
                      {!notification.is_read ? (
                        <span
                          aria-hidden="true"
                          className="ms-2 inline-block h-2 w-2 rounded-full bg-primary"
                        />
                      ) : null}
                    </span>
                    <span className="text-xs text-foreground-subtle" dir="ltr">
                      {formatDate(notification.created_at)}
                    </span>
                  </div>
                  {notification.body ? (
                    <p className="mt-1 text-sm text-foreground-muted">{notification.body}</p>
                  ) : null}
                  <span className="mt-2 inline-block">
                    <Badge variant="neutral">
                      {typeLabels[notification.type] ?? notification.type}
                    </Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </LayoutShell>
  );
}
