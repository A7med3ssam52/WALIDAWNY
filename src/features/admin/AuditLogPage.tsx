import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';

import { AdminNav } from '../../components/AdminNav';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { Pagination } from '../../components/Pagination';
import { Select } from '../../components/Select';
import { Skeleton } from '../../components/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from '../../components/Table';
import { useToast } from '../../components/Toast';
import { countAuditLogs, exportAuditLog, listAuditLogs } from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type { AuditFilters, AuditLogRow } from '../../types/database';

const ENTITY_TYPES = [
  'profiles',
  'grades',
  'units',
  'lessons',
  'lesson_videos',
  'lesson_pdfs',
  'unit_pricing',
  'unit_codes',
  'unit_purchases',
  'app_settings',
] as const;

const ENTITY_TYPE_LABELS: Record<string, string> = {
  profiles: 'الملفات الشخصية',
  grades: 'الصفوف',
  units: 'الوحدات',
  lessons: 'الدروس',
  lesson_videos: 'فيديوهات الدروس',
  lesson_pdfs: 'ملفات PDF الدروس',
  unit_pricing: 'أسعار الوحدات',
  unit_codes: 'أكواد الوحدات',
  unit_purchases: 'مشتريات الوحدات',
  app_settings: 'إعدادات التطبيق',
};

const ACTION_LABELS: Record<string, string> = {
  'grade.create': 'إنشاء صف',
  'grade.update': 'تعديل صف',
  'grade.delete': 'حذف صف',
  'grade.restore': 'استعادة صف',
  'unit.create': 'إنشاء وحدة',
  'unit.update': 'تعديل وحدة',
  'unit.delete': 'حذف وحدة',
  'unit.restore': 'استعادة وحدة',
  'unit.publish': 'نشر وحدة',
  'unit.hide': 'إخفاء وحدة',
  'lesson.create': 'إنشاء درس',
  'lesson.update': 'تعديل درس',
  'lesson.delete': 'حذف درس',
  'lesson.publish': 'نشر درس',
  'lesson.hide': 'إخفاء درس',
  'lesson_video.upload': 'رفع فيديو درس',
  'lesson_video.update': 'تعديل فيديو درس',
  'lesson_video.delete': 'حذف فيديو درس',
  'lesson_pdf.upload': 'رفع ملف PDF',
  'lesson_pdf.update': 'تعديل ملف PDF',
  'lesson_pdf.delete': 'حذف ملف PDF',
  'unit_pricing.set': 'تعيين سعر وحدة',
  'unit_code.create': 'إنشاء كود وحدة',
  'unit_code.revoke': 'إلغاء كود وحدة',
  'unit_purchase.create': 'شراء وحدة',
  'unit_purchase.void': 'إلغاء شراء وحدة',
  'profile.create': 'إنشاء ملف شخصي',
  'profile.update': 'تعديل ملف شخصي',
  'profile.delete': 'حذف ملف شخصي',
  'profile.role_change': 'تغيير دور مستخدم',
  'app_settings.update': 'تحديث إعدادات التطبيق',
  'unit.trial_set': 'تعيين درس تجريبي',
  'unit_code.generate': 'توليد أكواد',
  'unit_board.upload': 'رفع سبورة',
  'unit_board.delete': 'حذف سبورة',
};

const PAGE_SIZE = 50;

function toIsoStart(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

function toIsoEnd(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}

const FIELD_LABELS: Record<string, string> = {
  name: 'الاسم',
  sort_order: 'الترتيب',
  is_active: 'الحالة النشطة',
  status: 'الحالة',
  base_price: 'السعر الأساسي',
  platform_fee: 'رسوم المنصة',
  is_trial: 'درس تجريبي',
  grade_id: 'الصف',
  unit_id: 'الوحدة',
  lesson_id: 'الدرس',
  student_id: 'الطالب',
  role: 'الدور',
  full_name: 'الاسم الكامل',
  email: 'البريد الإلكتروني',
  phone: 'الهاتف',
  avatar_url: 'الصورة الشخصية',
  deleted_at: 'تاريخ الحذف',
  title: 'العنوان',
  description: 'الوصف',
  url: 'الرابط',
  duration_seconds: 'المدة',
  is_ready: 'جاهز',
  file_size: 'حجم الملف',
  mime_type: 'نوع الملف',
};

function metadataSummary(metadata: Record<string, unknown> | null): string {
  if (!metadata) {
    return '—';
  }
  const changed = metadata.changed_fields;
  if (Array.isArray(changed) && changed.length > 0) {
    const arabicFields = changed.map((f) => FIELD_LABELS[f as string] ?? f);
    return `تعديل: ${arabicFields.join('، ')}`;
  }
  if ('new' in metadata) {
    return 'إضافة';
  }
  if ('old' in metadata) {
    return 'حذف';
  }
  return '—';
}

function ActionLabel({ row }: { row: AuditLogRow }) {
  const arabicLabel = ACTION_LABELS[row.action];
  const displayText = arabicLabel || row.action.replace(/\./g, ' · ');
  return (
    <span className="text-xs text-foreground" dir="rtl">
      {displayText}
    </span>
  );
}

export function AuditLogPage() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<AuditLogRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);

  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorId, setActorId] = useState('');

  const filters = useMemo<AuditFilters>(() => {
    const next: AuditFilters = {
      from: fromDay ? toIsoStart(fromDay) : null,
      to: toDay ? toIsoEnd(toDay) : null,
      action: action.trim() || null,
      entityType: entityType || null,
      actorId: actorId.trim() || null,
    };
    return next;
  }, [fromDay, toDay, action, entityType, actorId]);

  const hasActiveFilters =
    fromDay !== '' || toDay !== '' || action !== '' || entityType !== '' || actorId !== '';

  const clearFilters = () => {
    setFromDay('');
    setToDay('');
    setAction('');
    setEntityType('');
    setActorId('');
  };

  const load = useCallback(
    async (targetPage: number) => {
      setError(false);
      try {
        const [data, count] = await Promise.all([
          listAuditLogs(filters, { limit: PAGE_SIZE, offset: targetPage * PAGE_SIZE }),
          countAuditLogs(filters),
        ]);
        setRows(data);
        setTotal(count);
        setPage(targetPage);
      } catch {
        setError(true);
      }
    },
    [filters],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const handleExport = async () => {
    setBusy(true);
    try {
      const url = await exportAuditLog(filters);
      window.open(url, '_blank', 'noopener,noreferrer');
      showToast('جاري تجهيز ملف التصدير');
    } catch {
      showToast('تعذر تصدير السجل. حاول مرة أخرى', 'error');
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <LayoutShell
      title="سجل النشاطات"
      subtitle="سجل تدقيقي غير قابل للتعديل لكل العمليات المهمة"
      variant="sidebar"
      nav={<AdminNav />}
    >
      <div className="flex flex-col gap-4">
        <Card title="تصفية السجل" subtitle="تُطبق الفلاتر على القائمة والعدد معًا">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              label="من تاريخ"
              name="audit-from"
              type="date"
              value={fromDay}
              onChange={(event) => setFromDay(event.target.value)}
            />
            <Input
              label="إلى تاريخ"
              name="audit-to"
              type="date"
              value={toDay}
              onChange={(event) => setToDay(event.target.value)}
            />
            <Input
              label="الإجراء (جزء من الاسم)"
              name="audit-action"
              type="text"
              value={action}
              onChange={(event) => setAction(event.target.value)}
              placeholder="مثال: grade.create"
            />
            <Select
              label="نوع الكيان"
              name="audit-entity"
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
            >
              <option value="">الكل</option>
              {ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ENTITY_TYPE_LABELS[type] ?? type}
                </option>
              ))}
            </Select>
            <Input
              label="معرف المستخدم"
              name="audit-actor"
              type="text"
              value={actorId}
              onChange={(event) => setActorId(event.target.value)}
              placeholder="uuid"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              icon={<Search aria-hidden="true" className="h-4 w-4" />}
              onClick={() => void load(0)}
            >
              بحث
            </Button>
            <Button
              variant="secondary"
              loading={busy}
              icon={<Download aria-hidden="true" className="h-4 w-4" />}
              onClick={() => void handleExport()}
            >
              تصدير CSV
            </Button>
          </div>
        </Card>

        <Card title="سجل العمليات" subtitle={`${total} عملية`}>
          {error ? (
            <ErrorState message="تعذر تحميل سجل النشاطات" onRetry={() => void load(page)} />
          ) : rows === null ? (
            <div className="flex flex-col gap-3" aria-hidden="true">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="لا توجد عمليات مسجلة"
              description="جرّب تعديل فلاتر البحث."
              action={
                hasActiveFilters ? (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    مسح الفلاتر
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeadCell>التاريخ</TableHeadCell>
                  <TableHeadCell>المستخدم</TableHeadCell>
                  <TableHeadCell>الإجراء</TableHeadCell>
                  <TableHeadCell>الكيان</TableHeadCell>
                  <TableHeadCell>التفاصيل</TableHeadCell>
                  <TableHeadCell>المنفذ من</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} data-testid={`audit-row-${row.id}`}>
                    <TableCell label="التاريخ">{formatDateTime(row.created_at)}</TableCell>
                    <TableCell label="المستخدم">
                      <span className="font-medium text-foreground">
                        {row.actor_name ?? 'نظام'}
                      </span>
                      <span className="ms-2 text-xs text-foreground-subtle">
                        {row.actor_role ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell label="الإجراء">
                      <ActionLabel row={row} />
                    </TableCell>
                    <TableCell label="الكيان">
                      <span className="text-xs text-foreground">
                        {ENTITY_TYPE_LABELS[row.entity_type] ?? row.entity_type}
                      </span>
                      {row.entity_id ? (
                        <span className="ms-2 font-mono text-xs text-foreground-subtle" dir="ltr">
                          {row.entity_id.slice(0, 8)}…
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell label="التفاصيل">{metadataSummary(row.metadata)}</TableCell>
                    <TableCell label="المنفذ من">
                      <span className="font-mono text-xs text-foreground-subtle" dir="ltr">
                        {row.ip_address ?? '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {rows !== null && rows.length > 0 ? (
            <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-sm text-foreground-subtle">
                صفحة {page + 1} من {totalPages}
              </p>
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={(next) => void load(next)}
              />
            </div>
          ) : null}
        </Card>
      </div>
    </LayoutShell>
  );
}
