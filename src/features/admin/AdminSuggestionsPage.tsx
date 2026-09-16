import { useCallback, useEffect, useState } from 'react';
import { Inbox, Save, Trash2 } from 'lucide-react';

import { AdminNav } from '../../components/AdminNav';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { Select } from '../../components/Select';
import { Skeleton } from '../../components/Skeleton';
import { StatCard } from '../../components/StatCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from '../../components/Table';
import { Toggle } from '../../components/Toggle';
import { useToast } from '../../components/Toast';
import {
  deleteSuggestion,
  getPublicSettings,
  listSuggestions,
  setAppSetting,
  updateSuggestionStatus,
} from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type { AdminSuggestionRow, SuggestionKind, SuggestionStatus } from '../../types/database';
import { SuggestionImageThumb } from '../suggestions/SuggestionImageThumb';
import {
  SUGGESTION_KIND_LABELS,
  SUGGESTION_STATUS_LABELS,
  SUGGESTION_STATUS_VARIANTS,
} from '../suggestions/suggestionLabels';

const PAGE_SIZE = 20;

const KIND_FILTERS: Array<{ value: SuggestionKind | ''; label: string }> = [
  { value: '', label: 'كل الأنواع' },
  { value: 'issue', label: SUGGESTION_KIND_LABELS.issue },
  { value: 'suggestion', label: SUGGESTION_KIND_LABELS.suggestion },
  { value: 'other', label: SUGGESTION_KIND_LABELS.other },
];

const STATUS_FILTERS: Array<{ value: SuggestionStatus | ''; label: string }> = [
  { value: '', label: 'كل الحالات' },
  { value: 'new', label: SUGGESTION_STATUS_LABELS.new },
  { value: 'reviewed', label: SUGGESTION_STATUS_LABELS.reviewed },
  { value: 'planned', label: SUGGESTION_STATUS_LABELS.planned },
  { value: 'done', label: SUGGESTION_STATUS_LABELS.done },
  { value: 'rejected', label: SUGGESTION_STATUS_LABELS.rejected },
];

const STATUS_ORDER: SuggestionStatus[] = ['new', 'reviewed', 'planned', 'done', 'rejected'];

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

interface StatusSelectProps {
  row: AdminSuggestionRow;
  disabled: boolean;
  testId: string;
  onChange: (row: AdminSuggestionRow, status: SuggestionStatus) => void;
}

function StatusSelect({ row, disabled, testId, onChange }: StatusSelectProps) {
  return (
    <select
      aria-label={`حالة المشاركة: ${row.title}`}
      value={row.status}
      disabled={disabled}
      onChange={(event) => void onChange(row, event.target.value as SuggestionStatus)}
      className="glass-input rounded-lg px-2 py-2 text-sm font-bold text-foreground"
      data-testid={testId}
    >
      {STATUS_ORDER.map((status) => (
        <option key={status} value={status}>
          {SUGGESTION_STATUS_LABELS[status]}
        </option>
      ))}
    </select>
  );
}

interface SuggestionCardProps {
  row: AdminSuggestionRow;
  statusBusy: boolean;
  onStatusChange: (row: AdminSuggestionRow, status: SuggestionStatus) => void;
  onDelete: (row: AdminSuggestionRow) => void;
}

/** Mobile-first readable card (table stays for md+ screens). */
function SuggestionCard({ row, statusBusy, onStatusChange, onDelete }: SuggestionCardProps) {
  return (
    <article
      className="glass-card flex flex-col gap-3 p-4 sm:p-5"
      data-testid={`suggestion-card-${row.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="info">{SUGGESTION_KIND_LABELS[row.kind]}</Badge>
        <Badge variant={SUGGESTION_STATUS_VARIANTS[row.status]}>
          {SUGGESTION_STATUS_LABELS[row.status]}
        </Badge>
        <span className="ms-auto text-[11px] text-foreground-subtle" dir="ltr">
          {formatDateTime(row.created_at)}
        </span>
      </div>

      <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 text-sm font-bold text-indigo-200"
        >
          {(row.student_name || '؟').trim().charAt(0)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{row.student_name || '—'}</p>
          <p className="mt-0.5 truncate text-xs text-foreground-muted" dir="ltr">
            {[row.student_phone, row.grade_name].filter(Boolean).join(' • ') || '—'}
          </p>
        </div>
      </div>

      <h3 className="text-[15px] font-bold leading-8 text-foreground">{row.title}</h3>
      <p className="text-sm leading-8 text-foreground-muted">{row.body}</p>

      {row.image_path ? (
        <SuggestionImageThumb path={row.image_path} title={row.title} />
      ) : null}

      <div className="flex items-center gap-2 border-t border-white/5 pt-3">
        <div className="min-w-0 flex-1">
          <StatusSelect
            row={row}
            disabled={statusBusy}
            testId={`suggestion-status-card-${row.id}`}
            onChange={onStatusChange}
          />
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(row)}
          icon={<Trash2 className="h-4 w-4" />}
          aria-label={`حذف مشاركة ${row.title}`}
        >
          حذف
        </Button>
      </div>
    </article>
  );
}

export function AdminSuggestionsPage() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<AdminSuggestionRow[] | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);
  const [kindFilter, setKindFilter] = useState<SuggestionKind | ''>('');
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | ''>('');
  const [busy, setBusy] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<AdminSuggestionRow | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  const [configOpen, setConfigOpen] = useState(true);
  const [bannerMessage, setBannerMessage] = useState('');
  const [closedMessage, setClosedMessage] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  const load = useCallback(
    async (targetPage: number, kind: SuggestionKind | '', status: SuggestionStatus | '') => {
      setError(false);
      try {
        const data = await listSuggestions({
          kind: kind || null,
          status: status || null,
          limit: PAGE_SIZE,
          offset: targetPage * PAGE_SIZE,
        });
        setRows(data);
        setPage(targetPage);
      } catch {
        setError(true);
      }
    },
    [],
  );

  const loadConfig = useCallback(async () => {
    try {
      const settings = await getPublicSettings();
      setConfigOpen(settings.suggestions_open !== false);
      setBannerMessage(settings.suggestions_banner_message ?? '');
      setClosedMessage(settings.suggestions_closed_message ?? '');
    } catch {
      // non-fatal: admin can still moderate
    } finally {
      setConfigLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load(0, '', '');
    void loadConfig();
  }, [load, loadConfig]);

  const handleFilterChange = (kind: SuggestionKind | '', status: SuggestionStatus | '') => {
    setKindFilter(kind);
    setStatusFilter(status);
    void load(0, kind, status);
  };

  const handleStatusChange = async (row: AdminSuggestionRow, status: SuggestionStatus) => {
    if (status === row.status) return;
    setStatusBusyId(row.id);
    try {
      const updated = await updateSuggestionStatus(row.id, status);
      setRows((previous) =>
        previous?.map((item) =>
          item.id === row.id
            ? { ...item, status: updated.status }
            : item,
        ) ?? [],
      );
      showToast('تم تحديث الحالة وإشعار الطالب');
    } catch {
      showToast('تعذر تحديث الحالة', 'error');
    } finally {
      setStatusBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    setBusy(true);
    try {
      await deleteSuggestion(deleteCandidate.id);
      showToast('تم حذف المشاركة');
      setDeleteCandidate(null);
      await load(page, kindFilter, statusFilter);
    } catch {
      showToast('تعذر الحذف. حاول مرة أخرى', 'error');
      setDeleteCandidate(null);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveConfig = async () => {
    setConfigSaving(true);
    try {
      await setAppSetting('suggestions_open', configOpen);
      await setAppSetting('suggestions_banner_message', bannerMessage.trim());
      await setAppSetting('suggestions_closed_message', closedMessage.trim());
      showToast('تم حفظ إعدادات المقترحات');
    } catch {
      showToast('تعذر حفظ الإعدادات', 'error');
    } finally {
      setConfigSaving(false);
    }
  };

  const counters = (rows ?? []).reduce<Record<SuggestionStatus, number>>(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { new: 0, reviewed: 0, planned: 0, done: 0, rejected: 0 },
  );

  return (
    <LayoutShell
      title="مقترحات الطلبة"
      subtitle="حصر مشاكل واقتراحات التحديث القادم"
      variant="sidebar"
      nav={<AdminNav />}
    >
      <div className="flex flex-col gap-5">
        <PageHeader
          title="مقترحات الطلبة"
          subtitle="كل ما يكتبه الطلبة يصل هنا مباشرة"
          icon={<Inbox className="h-5 w-5" />}
        />

        <Card title="إعدادات الاستقبال">
          {configLoaded ? (
            <div className="flex flex-col gap-4">
              <Toggle
                label={configOpen ? 'الاستقبال مفتوح' : 'الاستقبال مغلق'}
                name="suggestions-open"
                checked={configOpen}
                onChange={setConfigOpen}
                hint="عند الإغلاق يظهر للطلبة رسالة الإغلاق بدل نموذج الإرسال"
              />
              <div>
                <label htmlFor="suggestions-banner" className="mb-1.5 block text-sm font-bold text-foreground">
                  نص الدعوة للطلبة
                </label>
                <textarea
                  id="suggestions-banner"
                  value={bannerMessage}
                  onChange={(event) => setBannerMessage(event.target.value)}
                  rows={2}
                  maxLength={500}
                  className="glass-input w-full resize-y rounded-xl px-3 py-2.5 text-sm leading-7 text-foreground"
                />
              </div>
              <div>
                <label htmlFor="suggestions-closed" className="mb-1.5 block text-sm font-bold text-foreground">
                  رسالة الإغلاق
                </label>
                <textarea
                  id="suggestions-closed"
                  value={closedMessage}
                  onChange={(event) => setClosedMessage(event.target.value)}
                  rows={2}
                  maxLength={500}
                  className="glass-input w-full resize-y rounded-xl px-3 py-2.5 text-sm leading-7 text-foreground"
                />
              </div>
              <div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleSaveConfig()}
                  loading={configSaving}
                  disabled={configSaving}
                  icon={<Save className="h-4 w-4" />}
                  data-testid="suggestions-config-save"
                >
                  حفظ الإعدادات
                </Button>
              </div>
            </div>
          ) : (
            <Skeleton className="h-32 w-full rounded-xl" />
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STATUS_ORDER.map((status) => (
            <StatCard
              key={status}
              title={SUGGESTION_STATUS_LABELS[status]}
              value={rows === null ? '—' : String(counters[status])}
              variant={status === 'new' ? 'warning' : status === 'done' ? 'success' : 'default'}
            />
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Select
            label="النوع"
            value={kindFilter}
            onChange={(event) => handleFilterChange(event.target.value as SuggestionKind | '', statusFilter)}
          >
            {KIND_FILTERS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            label="الحالة"
            value={statusFilter}
            onChange={(event) => handleFilterChange(kindFilter, event.target.value as SuggestionStatus | '')}
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        {error ? (
          <ErrorState
            message="تعذر تحميل المقترحات"
            onRetry={() => void load(page, kindFilter, statusFilter)}
          />
        ) : rows === null ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            title="لا توجد مشاركات"
            description="لم يرسل الطلبة أي مشاركة بعد — تأكد أن الاستقبال مفتوح والبانر ظاهر لهم."
          />
        ) : (
          <>
            <div className="hidden md:block">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>الطالب</TableHeadCell>
                  <TableHeadCell>المشاركة</TableHeadCell>
                  <TableHeadCell>الحالة</TableHeadCell>
                  <TableHeadCell>إجراءات</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} data-testid={`suggestion-row-${row.id}`}>
                    <TableCell label="الطالب">
                      <p className="font-bold text-foreground">{row.student_name || '—'}</p>
                      <p className="mt-0.5 text-xs text-foreground-muted" dir="ltr">
                        {row.student_phone || ''}
                      </p>
                      {row.grade_name ? (
                        <p className="mt-0.5 text-xs text-foreground-subtle">{row.grade_name}</p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-foreground-subtle" dir="ltr">
                        {formatDateTime(row.created_at)}
                      </p>
                    </TableCell>
                    <TableCell label="المشاركة">
                      <span className="mb-1.5 inline-block">
                        <Badge variant="info">{SUGGESTION_KIND_LABELS[row.kind]}</Badge>
                      </span>
                      <p className="font-bold text-foreground">{row.title}</p>
                      <p className="mt-1 max-w-xl text-sm leading-7 text-foreground-muted">{row.body}</p>
                      {row.image_path ? (
                        <div className="mt-2">
                          <SuggestionImageThumb path={row.image_path} title={row.title} />
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell label="الحالة">
                      <StatusSelect
                        row={row}
                        disabled={statusBusyId === row.id}
                        testId={`suggestion-status-${row.id}`}
                        onChange={handleStatusChange}
                      />
                      <span className="mt-1.5 block">
                        <Badge variant={SUGGESTION_STATUS_VARIANTS[row.status]}>
                          {SUGGESTION_STATUS_LABELS[row.status]}
                        </Badge>
                      </span>
                    </TableCell>
                    <TableCell label="إجراءات">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteCandidate(row)}
                        icon={<Trash2 className="h-4 w-4" />}
                        aria-label={`حذف مشاركة ${row.title}`}
                      >
                        حذف
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            <div className="flex flex-col gap-3 md:hidden">
              {rows.map((row) => (
                <SuggestionCard
                  key={row.id}
                  row={row}
                  statusBusy={statusBusyId === row.id}
                  onStatusChange={handleStatusChange}
                  onDelete={setDeleteCandidate}
                />
              ))}
            </div>
            {rows.length === PAGE_SIZE ? (
              <Pagination page={page} totalPages={page + 2} onPageChange={(next) => void load(next, kindFilter, statusFilter)} />
            ) : page > 0 ? (
              <Pagination page={page} totalPages={page + 1} onPageChange={(next) => void load(next, kindFilter, statusFilter)} />
            ) : null}
          </>
        )}
      </div>

      <Modal
        open={deleteCandidate !== null}
        title="حذف المشاركة"
        description={deleteCandidate ? `سيتم حذف "${deleteCandidate.title}" نهائيًا مع صورتها إن وجدت.` : undefined}
        confirmLabel="حذف نهائي"
        danger
        loading={busy}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteCandidate(null)}
      />
    </LayoutShell>
  );
}
