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
import { RoleNav } from '../../components/RoleNav';
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
  createUnitCodesForStaff,
  getRpcErrorCode,
  listCodesByUnit,
  listUnitPricing,
  revokeUnitCode,
} from '../../data/rpc';
import { copyText } from '../../lib/clipboard';
import { formatDateTime, formatPrice } from '../../lib/format';
import type { UnitCodeWithUnit, UnitPricingWithUnit } from '../../types/database';

const CODE_ERROR_MESSAGES: Record<string, string> = {
  invalid_count: 'يجب أن يكون العدد بين 1 و 500',
  unit_not_found: 'الوحدة المختارة غير موجودة',
  unit_inactive: 'هذه الوحدة غير متاحة حالياً',
  code_not_found: 'الكود غير موجود',
  code_not_revocable: 'هذا الكود لا يمكن إلغاؤه',
  code_already_used: 'الكود المستخدم لا يمكن إلغاؤه',
  permission_denied: 'ليست لديك صلاحية',
  access_denied: 'ليست لديك صلاحية',
  system_actor_required: 'حدث خطأ داخلي في توليد الأكواد',
  unit_pricing_not_found: 'لا يوجد تسعير لهذه الوحدة',
  generation_failed: 'فشل توليد الأكواد — حاول مرة أخرى',
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
  const [codes, setCodes] = useState<UnitCodeWithUnit[] | null>(null);
  const [pricing, setPricing] = useState<UnitPricingWithUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [count, setCount] = useState('');
  const [note, setNote] = useState('');
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<UnitCodeWithUnit | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const nextPricing = await listUnitPricing();
      setPricing(nextPricing);
      setSelectedUnitId((prev) => prev || (nextPricing[0]?.unit_id ?? ''));
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedUnitId) {
      setCodes([]);
      return () => {
        cancelled = true;
      };
    }
    setCodes(null);
    listCodesByUnit(selectedUnitId)
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
  }, [selectedUnitId]);

  const handleGenerate = async () => {
    setCountError(null);
    if (!selectedUnitId) {
      setCountError('لا توجد وحدات متاحة');
      return;
    }
    const countNumber = Math.trunc(Number(count));
    if (!count.trim() || !Number.isFinite(countNumber) || countNumber < 1 || countNumber > 500) {
      setCountError('يجب أن يكون العدد بين 1 و 500');
      return;
    }
    setGenerating(true);
    try {
      const result = await createUnitCodesForStaff(selectedUnitId, countNumber, note.trim() || null);
      setGeneratedCodes(result.map((item) => item.code));
      showToast(`تم توليد ${result.length} كود بنجاح`);
      const rows = await listCodesByUnit(selectedUnitId);
      setCodes(rows);
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
    const ok = await copyText(generatedCodes.join('\n'));
    if (ok) {
      setCopied(true);
      showToast('تم نسخ الأكواد');
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      showToast('تعذر نسخ الأكواد', 'error');
    }
  };

  const handleCopyCode = async (item: UnitCodeWithUnit) => {
    const ok = await copyText(item.code);
    if (ok) {
      setCopiedCodeId(item.id);
      showToast('تم نسخ الكود');
      window.setTimeout(() => {
        setCopiedCodeId((current) => (current === item.id ? null : current));
      }, 2000);
    } else {
      showToast('تعذر نسخ الكود', 'error');
    }
  };

  const handleRevoke = async () => {
    if (!revoking) {
      return;
    }
    setRevokeBusy(true);
    try {
      await revokeUnitCode(revoking.id);
      setRevoking(null);
      showToast('تم إلغاء الكود');
      const rows = await listCodesByUnit(selectedUnitId);
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
      title="أكواد الوحدات"
      subtitle="توليد أكواد تفعيل للوحدات ومتابعة حالة كل كود"
      variant="sidebar"
      nav={<RoleNav />}
    >
      <div className="flex flex-col gap-4">
        <Card title="توليد أكواد" subtitle="كل كود يُستخدم مرة واحدة فقط لتفعيل وحدة مدى الحياة">
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="الوحدة"
                name="code-unit"
                value={selectedUnitId}
                onChange={(event) => {
                  setSelectedUnitId(event.target.value);
                  setGeneratedCodes([]);
                }}
              >
                {pricing.length === 0 ? (
                  <option value="">لا توجد وحدات مسعّرة</option>
                ) : (
                  pricing.map((item) => (
                    <option key={item.unit_id} value={item.unit_id}>
                      {item.grade_name} — {item.unit_name} ({formatPrice(item.total_price)})
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
              <Input
                label="ملاحظة (اختياري)"
                name="code-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
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
          ) : pricing.length === 0 ? (
            <EmptyState
              title="لا توجد وحدات مسعّرة"
              description="أضف سعرًا لوحدة من صفحة أسعار الوحدات أولاً."
            />
          ) : codes.length === 0 ? (
            <EmptyState
              title="لا توجد أكواد لهذه الوحدة بعد"
              description="استخدم النموذج بالأعلى لتوليد أكواد لهذه الوحدة."
            />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>الكود</TableHeadCell>
                  <TableHeadCell>الوحدة</TableHeadCell>
                  <TableHeadCell>تم إنشاؤه</TableHeadCell>
                  <TableHeadCell>ملاحظة</TableHeadCell>
                  <TableHeadCell>الحالة</TableHeadCell>
                  <TableHeadCell>إجراءات</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {codes.map((item) => {
                  const isUsed = item.status === 'used';
                  const isRevoked = item.status === 'revoked';
                  return (
                    <TableRow key={item.id} data-testid={`code-row-${item.id}`}>
                      <TableCell label="الكود">
                        <div className="flex items-center gap-2">
                          <code
                            className="font-mono text-sm font-medium text-foreground"
                            dir="ltr"
                          >
                            {item.code}
                          </code>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={
                              copiedCodeId === item.id ? (
                                <Check aria-hidden="true" className="h-4 w-4" />
                              ) : (
                                <Copy aria-hidden="true" className="h-4 w-4" />
                              )
                            }
                            onClick={() => void handleCopyCode(item)}
                            aria-label={`نسخ ${item.code}`}
                          >
                            {copiedCodeId === item.id ? COPIED_LABEL : 'نسخ'}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell label="الوحدة" className="text-foreground-muted">
                        {item.unit_name || '—'}
                      </TableCell>
                      <TableCell label="تم إنشاؤه">{formatDateTime(item.created_at)}</TableCell>
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