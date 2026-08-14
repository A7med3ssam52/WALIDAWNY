import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { Skeleton } from '../../components/Skeleton';
import { StaffNav } from '../../components/StaffNav';
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
  generateSubscriptionCodes,
  getRpcErrorCode,
  listCodesByPlan,
  listPricingPlans,
  revokeSubscriptionCode,
} from '../../data/rpc';
import { formatDateTime, formatPrice } from '../../lib/format';
import type { CodeWithStudent, PricingPlanWithGrade } from '../../types/database';

const CODE_ERROR_MESSAGES: Record<string, string> = {
  invalid_count: 'يجب أن يكون العدد بين 1 و 500',
  plan_inactive: 'الخطة غير متاحة حالياً',
  plan_not_found: 'الخطة المختارة غير موجودة',
  permission_denied: 'ليست لديك صلاحية',
  access_denied: 'ليست لديك صلاحية',
};

function codeErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && CODE_ERROR_MESSAGES[code]) {
    return CODE_ERROR_MESSAGES[code];
  }
  return 'تعذر تنفيذ العملية. حاول مرة أخرى';
}

const COPIED_LABEL = 'تم النسخ ✓';

export function CodesPage() {
  const { showToast } = useToast();
  const [codes, setCodes] = useState<CodeWithStudent[] | null>(null);
  const [plans, setPlans] = useState<PricingPlanWithGrade[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [count, setCount] = useState('');
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<CodeWithStudent | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const nextPlans = await listPricingPlans();
      setPlans(nextPlans);
      setSelectedPlanId((prev) => prev || (nextPlans[0]?.id ?? ''));
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedPlanId) {
      setCodes([]);
      return () => {
        cancelled = true;
      };
    }
    setCodes(null);
    listCodesByPlan(selectedPlanId)
      .then((rows) => {
        if (!cancelled) {
          setCodes(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPlanId]);

  const handleGenerate = async () => {
    setCountError(null);
    if (!selectedPlanId) {
      setCountError('لا توجد خطط نشطة');
      return;
    }
    const countNumber = Math.trunc(Number(count));
    if (!count.trim() || !Number.isFinite(countNumber) || countNumber < 1 || countNumber > 500) {
      setCountError('يجب أن يكون العدد بين 1 و 500');
      return;
    }
    setGenerating(true);
    try {
      const result = await generateSubscriptionCodes(selectedPlanId, countNumber);
      setGeneratedCodes(result);
      showToast(`تم توليد ${result.length} كود بنجاح`);
    } catch (err) {
      setCountError(codeErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  const copyCodes = async () => {
    if (generatedCodes.length === 0) {
      return;
    }
    try {
      await navigator.clipboard.writeText(generatedCodes.join('\n'));
      setCopied(true);
      showToast('تم نسخ الأكواد');
    } catch {
      showToast('تعذر نسخ الأكواد', 'error');
    }
  };

  const handleRevoke = async () => {
    if (!revoking) {
      return;
    }
    setRevokeBusy(true);
    try {
      await revokeSubscriptionCode(revoking.id);
      setRevoking(null);
      showToast('تم إلغاء الكود');
      const rows = await listCodesByPlan(selectedPlanId);
      setCodes(rows);
    } catch (err) {
      showToast(codeErrorMessage(err), 'error');
      setRevoking(null);
    } finally {
      setRevokeBusy(false);
    }
  };

  return (
    <LayoutShell
      title="أكواد التفعيل"
      subtitle="توليد أكواد تفعيل للطلاب ومتابعة حالة كل كود"
      variant="sidebar"
      nav={<StaffNav />}
    >
      <div className="flex flex-col gap-4">
        <Card title="توليد أكواد" subtitle="كل كود يُستخدم مرة واحدة فقط لتفعيل اشتراك">
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="الخطة"
                name="code-plan"
                value={selectedPlanId}
                onChange={(event) => setSelectedPlanId(event.target.value)}
              >
                {plans.length === 0 ? (
                  <option value="">لا توجد خطط نشطة</option>
                ) : (
                  plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.grade_name ?? '—'} — {plan.duration_days} يوم (
                      {formatPrice(plan.total_price)})
                    </option>
                  ))
                )}
              </Select>
              <Input
                label="عدد الأكواد (1 - 500)"
                name="code-count"
                type="number"
                value={count}
                min={1}
                max={500}
                onChange={(event) => setCount(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                loading={generating}
                icon={<KeyRound aria-hidden="true" className="h-4 w-4" />}
                onClick={() => void handleGenerate()}
              >
                توليد الأكواد
              </Button>
            </div>
            {countError ? (
              <p role="alert" className="text-xs font-medium text-error">
                {countError}
              </p>
            ) : null}
          </div>
          {generatedCodes.length > 0 ? (
            <div className="glass-tile-success mt-3 rounded-lg border px-4 py-3">
              <p className="text-sm font-semibold text-primary-strong">
                تم توليد {generatedCodes.length} كود
              </p>
              <p className="mt-1 text-xs text-primary-strong">
                الكود ظاهر لك فقط — احفظه قبل مغادرة الصفحة.
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <pre
                  className="flex-1 overflow-x-auto font-mono text-sm font-semibold leading-6 text-foreground"
                  dir="ltr"
                >
                  {generatedCodes.join('\n')}
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={
                    copied ? (
                      <Check aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <Copy aria-hidden="true" className="h-4 w-4" />
                    )
                  }
                  onClick={() => void copyCodes()}
                >
                  {copied ? COPIED_LABEL : 'نسخ'}
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        <Card title="الأكواد المولدة">
          {error ? (
            <ErrorState message="تعذر تحميل الأكواد" onRetry={() => void load()} />
          ) : codes === null ? (
            <div className="flex flex-col gap-3" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded-sm" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <EmptyState
              title="لا توجد خطط نشطة"
              description="أضف خطة اشتراك من صفحة الأسعار أولاً."
            />
          ) : codes.length === 0 ? (
            <EmptyState
              title="لا توجد أكواد لهذه الخطة بعد"
              description="استخدم النموذج بالأعلى لتوليد أكواد لهذه الخطة."
            />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>الكود</TableHeadCell>
                  <TableHeadCell>الخطة</TableHeadCell>
                  <TableHeadCell>تم إنشاؤه</TableHeadCell>
                  <TableHeadCell>الطالب</TableHeadCell>
                  <TableHeadCell>ملاحظة</TableHeadCell>
                  <TableHeadCell>الحالة</TableHeadCell>
                  <TableHeadCell>إجراءات</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {codes.map((item) => {
                  const isUsed = item.status === 'used';
                  const isRevoked = item.status === 'revoked';
                  const plan = plans.find((entry) => entry.id === item.pricing_plan_id);
                  return (
                    <TableRow key={item.id} data-testid={`code-row-${item.id}`}>
                      <TableCell label="الكود">
                        <code className="font-mono text-sm font-medium text-foreground" dir="ltr">
                          {item.code}
                        </code>
                      </TableCell>
                      <TableCell label="الخطة" className="text-foreground-muted">
                        {plan ? (
                          <>
                            {plan.grade_name ?? '—'} — {plan.duration_days} يوم (
                            {formatPrice(plan.total_price)})
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell label="تم إنشاؤه">{formatDateTime(item.created_at)}</TableCell>
                      <TableCell label="الطالب">
                        {item.student_name ? (
                          <span className="font-medium text-foreground">{item.student_name}</span>
                        ) : (
                          <span className="text-foreground-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell label="ملاحظة">
                        {item.note ? (
                          <span className="text-foreground-muted">{item.note}</span>
                        ) : (
                          <span className="text-foreground-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell label="الحالة">
                        <Badge variant={isUsed ? 'info' : isRevoked ? 'neutral' : 'success'}>
                          {isUsed ? 'مستخدم' : isRevoked ? 'ملغي' : 'متاح'}
                        </Badge>
                      </TableCell>
                      <TableCell label="إجراءات">
                        {isUsed || isRevoked ? (
                          <span className="text-xs text-foreground-muted">—</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                            onClick={() => setRevoking(item)}
                            className="text-error hover:bg-rose-500/10 hover:text-error"
                          >
                            إلغاء
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Modal
        open={revoking !== null}
        title="إلغاء كود"
        description={
          revoking
            ? `سيصبح الكود ${revoking.code} غير صالح للاستخدام بعد الإلغاء. لا يمكن التراجع عن هذه العملية.`
            : ''
        }
        confirmLabel="نعم، إلغاء"
        danger
        loading={revokeBusy}
        onConfirm={() => void handleRevoke()}
        onCancel={() => {
          if (!revokeBusy) {
            setRevoking(null);
          }
        }}
      />
    </LayoutShell>
  );
}
