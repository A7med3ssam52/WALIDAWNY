import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, KeyRound } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { Skeleton } from '../../components/Skeleton';
import { StudentNav } from '../../components/StudentNav';
import { StatusBadge } from '../../components/StatusBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from '../../components/Table';
import { useToast } from '../../components/Toast';
import {
  getMyCurrentSubscription,
  getMySubscriptions,
  getRpcErrorCode,
  redeemSubscriptionCode,
} from '../../data/rpc';
import { formatDate, formatPrice, remainingDays } from '../../lib/format';
import type { SubscriptionWithPlan } from '../../types/database';

const REDEEM_ERROR_MESSAGES: Record<string, string> = {
  code_not_found: 'الكود غير صالح',
  code_already_used: 'تم استخدام هذا الكود بالفعل',
  code_revoked: 'تم إلغاء هذا الكود',
  code_expired: 'انتهت صلاحية هذا الكود',
  student_has_active_subscription: 'لديك اشتراك نشط بالفعل',
  subscription_already_active: 'لديك اشتراك نشط بالفعل',
  plan_not_available: 'الخطة غير متاحة حاليًا',
  plan_grade_mismatch: 'هذا الكود لا يتوافق مع صفك الدراسي',
  no_grade_assigned: 'لم يتم تحديد صفك الدراسي بعد — تواصل مع الأستاذ',
};

function redeemErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && REDEEM_ERROR_MESSAGES[code]) {
    return REDEEM_ERROR_MESSAGES[code];
  }
  return 'تعذر تفعيل الاشتراك. حاول مرة أخرى';
}

function PlanName({ subscription }: { subscription: SubscriptionWithPlan }) {
  if (!subscription.plan_label && !subscription.grade_name) {
    return '—';
  }
  return [subscription.grade_name, subscription.plan_label].filter(Boolean).join(' — ');
}

function SubscriptionCardSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className="glass-card space-y-2 p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function StudentSubscriptionsPage() {
  const { showToast } = useToast();
  const [current, setCurrent] = useState<SubscriptionWithPlan | null | undefined>(undefined);
  const [history, setHistory] = useState<SubscriptionWithPlan[] | null>(null);
  const [error, setError] = useState(false);
  const [code, setCode] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [nextCurrent, nextHistory] = await Promise.all([
        getMyCurrentSubscription(),
        getMySubscriptions(),
      ]);
      setCurrent(nextCurrent);
      setHistory(nextHistory);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRedeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setRedeemError('أدخل كود التفعيل');
      return;
    }
    setRedeemError(null);
    setRedeemBusy(true);
    try {
      await redeemSubscriptionCode(trimmed);
      setCode('');
      showToast('تم تفعيل الاشتراك بنجاح');
      await load();
    } catch (err) {
      setRedeemError(redeemErrorMessage(err));
    } finally {
      setRedeemBusy(false);
    }
  };

  const expiredLatest =
    current === null &&
    history &&
    history.length > 0 &&
    new Date(history[0].expires_at).getTime() <= Date.now()
      ? history[0]
      : null;
  const daysLeft = current ? remainingDays(current.expires_at) : null;

  return (
    <LayoutShell
      title="الاشتراكات"
      subtitle="حالة اشتراكك الحالية وسجل الاشتراكات السابقة"
      variant="sidebar" nav={<StudentNav />}
    >
      <div className="flex flex-col gap-4">
        <Card
          title="الاشتراك الحالي"
          actions={<CalendarClock aria-hidden="true" className="h-5 w-5 text-foreground-subtle" />}
        >
          {error ? (
            <ErrorState message="تعذر تحميل بيانات الاشتراك" onRetry={() => void load()} />
          ) : current === undefined || history === null ? (
            <SubscriptionCardSkeleton />
          ) : current ? (
            <div className="glass-tile-success rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">
                    <PlanName subscription={current} />
                  </p>
                  <p className="mt-1 text-sm text-foreground-muted" dir="ltr">
                    {formatPrice(current.total_price)}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-1 text-end">
                  <StatusBadge status="active" deleted={false} />
                  <p className="text-sm font-medium text-foreground">
                    {daysLeft !== null ? `متبقي ${daysLeft} يوم` : ''}
                  </p>
                  <p className="text-xs text-foreground-subtle">
                    ينتهي في {formatDate(current.expires_at)}
                  </p>
                </div>
              </div>
            </div>
          ) : expiredLatest ? (
            <div className="glass-tile-warning rounded-lg border p-4">
              <p className="font-medium text-foreground">انتهى</p>
              <p className="mt-1 text-sm text-foreground-muted">
                انتهى اشتراكك في {formatDate(expiredLatest.expires_at)} — يمكنك تفعيل اشتراك جديد
                بكود بالأسفل.
              </p>
            </div>
          ) : (
            <div className="glass-tile rounded-lg border border-dashed border-primary/25 p-4 text-center">
              <p className="text-sm text-foreground-muted">
                لا يوجد اشتراك نشط بعد — استخدم كود التفعيل بالأسفل.
              </p>
            </div>
          )}
        </Card>

        <Card title="تفعيل اشتراك" subtitle="أدخل كود التفعيل الذي حصلت عليه من الأستاذ">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="w-full sm:max-w-xs">
              <Input
                label="كود التفعيل"
                name="redeem-code"
                placeholder="WLDN-XXXX-XXXX-XXXX"
                value={code}
                error={redeemError ?? undefined}
                dir="ltr"
                onChange={(event) => setCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !redeemBusy) {
                    void handleRedeem();
                  }
                }}
              />
            </div>
            <Button
              loading={redeemBusy}
              onClick={() => void handleRedeem()}
              icon={<KeyRound aria-hidden="true" className="h-4 w-4" />}
              className="sm:mt-6"
            >
              تفعيل
            </Button>
          </div>
        </Card>

        <Card title="سجل الاشتراكات">
          {error ? (
            <ErrorState message="تعذر تحميل سجل الاشتراكات" onRetry={() => void load()} />
          ) : history === null ? (
            <HistorySkeleton />
          ) : history.length === 0 ? (
            <EmptyState title="لا توجد اشتراكات بعد — استخدم كود التفعيل" />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>الخطة</TableHeadCell>
                  <TableHeadCell>تاريخ البدء</TableHeadCell>
                  <TableHeadCell>تاريخ الانتهاء</TableHeadCell>
                  <TableHeadCell>المصدر</TableHeadCell>
                  <TableHeadCell>الحالة</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map((subscription) => (
                  <TableRow
                    key={subscription.id}
                    data-testid={`subscription-row-${subscription.id}`}
                  >
                    <TableCell label="الخطة" className="font-medium text-foreground">
                      <PlanName subscription={subscription} />
                    </TableCell>
                    <TableCell label="تاريخ البدء">{formatDate(subscription.started_at)}</TableCell>
                    <TableCell label="تاريخ الانتهاء">
                      {formatDate(subscription.expires_at)}
                    </TableCell>
                    <TableCell label="المصدر">
                      {subscription.source === 'manual' ? 'يدوي' : 'كود تفعيل'}
                    </TableCell>
                    <TableCell label="الحالة">
                      {subscription.status === 'active' ? (
                        <StatusBadge status="active" deleted={false} />
                      ) : (
                        <Badge variant="neutral">منتهي</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </LayoutShell>
  );
}
