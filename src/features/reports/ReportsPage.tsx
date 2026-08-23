import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BadgeCheck, Banknote, Layers, TrendingUp, Wallet, WalletMinimal } from 'lucide-react';

import { AdminNav } from '../../components/AdminNav';
import { LayoutShell } from '../../components/LayoutShell';
import { StaffNav } from '../../components/StaffNav';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Skeleton } from '../../components/Skeleton';
import { StatCard } from '../../components/StatCard';
import { Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from '../../components/Table';
import { useToast } from '../../components/Toast';
import {
  addPlatformExpense,
  addPlatformPayout,
  getFinancialReports,
  listPlatformExpenses,
  listPlatformPayouts,
} from '../../data/rpc';
import { useAuth } from '../auth/AuthContext';
import { formatDate, formatDateTime, formatPrice } from '../../lib/format';
import type { FinancialReports, Grade, Unit } from '../../types/database';
import { getSupabaseClient } from '../../lib/supabase';

function SectionCard({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return <Card title={title} subtitle={subtitle} actions={actions}>{children}</Card>;
}

function toIsoStart(d: string) { return d ? new Date(`${d}T00:00:00`).toISOString() : null; }
function toIsoEnd(d: string) { return d ? new Date(`${d}T23:59:59.999`).toISOString() : null; }

export function ReportsPage() {
  const { role } = useAuth();
  const { showToast } = useToast();
  const isAdmin = role === 'admin';
  const isTeacher = role === 'mr_walid' || role === 'teacher' || isAdmin;

  const [reports, setReports] = useState<FinancialReports | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [unitId, setUnitId] = useState('');

  const [grades, setGrades] = useState<Grade[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  // admin-only ledgers
  const [expenses, setExpenses] = useState<import('../../types/database').PlatformExpense[]>([]);
  const [payouts, setPayouts] = useState<import('../../types/database').PlatformPayout[]>([]);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCat, setExpenseCat] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutNote, setPayoutNote] = useState('');
  const [expenseBusy, setExpenseBusy] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState(false);

  const filters = useMemo(() => ({
    from: fromDay ? toIsoStart(fromDay) : null,
    to: toDay ? toIsoEnd(toDay) : null,
    gradeId: gradeId || null,
    unitId: unitId || null,
  }), [fromDay, toDay, gradeId, unitId]);

  const load = useCallback(async () => {
    setError(false); setLoading(true);
    try {
      const data = await getFinancialReports(filters);
      setReports(data);
      if (isAdmin) {
        const [ex, pa] = await Promise.all([
          listPlatformExpenses({ from: filters.from, to: filters.to }),
          listPlatformPayouts({ from: filters.from, to: filters.to }),
        ]);
        setExpenses(ex); setPayouts(pa);
      }
    } catch { setError(true); } finally { setLoading(false); }
  }, [filters, isAdmin]);

  useEffect(() => { void load(); }, [load]);

  // load grades/units for filter dropdowns
  useEffect(() => {
    void (async () => {
      try {
        const c = getSupabaseClient();
        const { data: g } = await c.from('grades').select('*').is('deleted_at', null).order('sort_order');
        setGrades((g ?? []) as Grade[]);
      } catch { /* ignore */ }
    })();
  }, []);
  useEffect(() => {
    void (async () => {
      if (!gradeId) { setUnits([]); setUnitId(''); return; }
      try {
        const c = getSupabaseClient();
        const { data: u } = await c.from('units').select('*').eq('grade_id', gradeId).is('deleted_at', null).order('sort_order');
        setUnits((u ?? []) as Unit[]);
      } catch { setUnits([]); }
    })();
  }, [gradeId]);

  const handleAddExpense = async () => {
    const amt = Number(expenseAmount);
    if (!amt || amt <= 0) { showToast('أدخل مبلغ صحيح', 'error'); return; }
    if (!expenseCat.trim()) { showToast('أدخل فئة المصروف', 'error'); return; }
    setExpenseBusy(true);
    try { await addPlatformExpense({ amount: amt, category: expenseCat.trim(), description: expenseDesc.trim() || null }); showToast('تم تسجيل المصروف'); setExpenseAmount(''); setExpenseCat(''); setExpenseDesc(''); void load(); } catch { showToast('تعذر حفظ المصروف', 'error'); } finally { setExpenseBusy(false); }
  };
  const handleAddPayout = async () => {
    const amt = Number(payoutAmount);
    if (!amt || amt <= 0) { showToast('أدخل مبلغ صحيح', 'error'); return; }
    setPayoutBusy(true);
    try { await addPlatformPayout({ amount: amt, note: payoutNote.trim() || null }); showToast('تم تسجيل التحويل لمستر وليد'); setPayoutAmount(''); setPayoutNote(''); void load(); } catch { showToast('تعذر حفظ التحويل', 'error'); } finally { setPayoutBusy(false); }
  };

  const exportCsv = () => {
    if (!reports) return;
    const rows: string[][] = [['النوع','الاسم','المبيعات','إيراد المدرس','إيراد المنصة','الإجمالي']];
    reports.by_grade.forEach(r => rows.push(['صف', r.grade_name, String(r.purchases), String(r.base_revenue), String(r.platform_revenue), String(r.total_revenue)]));
    reports.by_unit.forEach(r => rows.push(['وحدة', `${r.unit_name} (${r.grade_name})`, String(r.purchases), String(r.base_revenue), String(r.platform_revenue), String(r.total_revenue)]));
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `reports-${fromDay || 'all'}-${toDay || 'all'}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const title = isAdmin ? 'تقارير المنصة المالية' : 'تقاريري المالية';
  const subtitle = isAdmin ? 'كل الفلوس الداخلة والخارجة - تحكم كامل' : 'إيراداتك من بيع الوحدات (الفلوس الداخلة)';
  const shellNav = isAdmin ? <AdminNav /> : <StaffNav />;

  if (error) return <LayoutShell title={title} subtitle={subtitle} variant="sidebar" nav={shellNav}><ErrorState message="تعذر تحميل التقارير" onRetry={() => void load()} /></LayoutShell>;

  return (
    <LayoutShell title={title} subtitle={subtitle} variant="sidebar" nav={shellNav}>
      <div className="space-y-6">
      <Card title={title} subtitle={subtitle} actions={<Button variant="secondary" size="sm" onClick={exportCsv} disabled={!reports}>تصدير CSV</Button>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input label="من تاريخ" type="date" value={fromDay} onChange={e => setFromDay(e.target.value)} />
          <Input label="إلى تاريخ" type="date" value={toDay} onChange={e => setToDay(e.target.value)} />
          <Select label="الصف" value={gradeId} onChange={e => setGradeId(e.target.value)}>
            <option value="">الكل</option>
            {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
          <Select label="الوحدة" value={unitId} onChange={e => setUnitId(e.target.value)} disabled={!gradeId}>
            <option value="">الكل</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          <div className="flex items-end"><Button variant="primary" onClick={() => void load()} className="w-full">تطبيق الفلتر</Button></div>
        </div>
        {(fromDay || toDay || gradeId || unitId) ? <div className="mt-3"><Button variant="ghost" size="sm" onClick={() => { setFromDay(''); setToDay(''); setGradeId(''); setUnitId(''); }}>مسح الفلاتر</Button></div> : null}
      </Card>

      {loading || !reports ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({length:8},(_,i)=><Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <>
          {/* KPI CARDS */}
          {isAdmin ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard title="إجمالي التحصيل" value={formatPrice(reports.summary.total_revenue)} icon={<Layers className="h-5 w-5" />} variant="primary" />
              <StatCard title="إيراد مستر وليد" value={formatPrice(reports.summary.total_base)} icon={<Wallet className="h-5 w-5" />} variant="success" />
              <StatCard title="إيراد المنصة" value={formatPrice(reports.summary.total_platform_fee)} icon={<Banknote className="h-5 w-5" />} variant="info" />
              <StatCard title="صافي ربح المنصة" value={formatPrice(reports.summary.net_platform)} icon={<TrendingUp className="h-5 w-5" />} variant={reports.summary.net_platform >=0 ? 'success':'warning'} />
              <StatCard title="عدد المبيعات" value={String(reports.summary.total_purchases)} icon={<BadgeCheck className="h-5 w-5" />} />
              <StatCard title="إجمالي رسوم المنصة" value={formatPrice(reports.summary.total_platform_fee)} icon={<Banknote className="h-5 w-5" />} variant="info" />
              <StatCard title="إجمالي المصروفات" value={formatPrice(reports.summary.expenses_total)} icon={<WalletMinimal className="h-5 w-5" />} variant="warning" />
              <StatCard title="تحويلات لمستر وليد" value={formatPrice(reports.summary.payouts_total)} icon={<ArrowUpRight className="h-5 w-5" />} variant="warning" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard title="إجمالي مبيعاتي" value={String(reports.summary.total_purchases)} icon={<BadgeCheck className="h-5 w-5" />} variant="success" />
              <StatCard title="إجمالي إيرادي" value={formatPrice(reports.summary.total_base)} icon={<Wallet className="h-5 w-5" />} variant="success" />
              <StatCard title="إجمالي رسوم المنصة" value={formatPrice(reports.summary.total_platform_fee)} icon={<Banknote className="h-5 w-5" />} variant="info" />
              <StatCard title="إيراد متوقع (أكواد متاحة)" value={formatPrice(reports.code_stats.pending_base)} icon={<Layers className="h-5 w-5" />} variant="info" />
            </div>
          )}

          {/* Incoming breakdown */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title={isAdmin ? 'الإيرادات حسب الصف (داخلة)' : 'مبيعاتي حسب الصف'}>
              {reports.by_grade.length===0 ? <EmptyState title="لا توجد بيانات" /> : (
                <Table>
                  <TableHead><TableRow>
                    <TableHeadCell>الصف</TableHeadCell><TableHeadCell>مبيعات</TableHeadCell>
                    {isTeacher ? <><TableHeadCell>{isAdmin ? 'نصيب المدرس' : 'إيرادي'}</TableHeadCell>{isAdmin ? <><TableHeadCell>نصيب المنصة</TableHeadCell><TableHeadCell>الإجمالي</TableHeadCell></> : null}</> : null}
                  </TableRow></TableHead>
                  <TableBody>{reports.by_grade.map(r=>(
                    <TableRow key={r.grade_id}>
                      <TableCell className="font-medium">{r.grade_name}</TableCell>
                      <TableCell>{r.purchases}</TableCell>
                      <TableCell dir="ltr" className="font-mono">{formatPrice(isAdmin ? r.base_revenue : r.base_revenue)}</TableCell>
                      {isAdmin ? <><TableCell dir="ltr" className="font-mono">{formatPrice(r.platform_revenue)}</TableCell><TableCell dir="ltr" className="font-mono font-bold">{formatPrice(r.total_revenue)}</TableCell></> : null}
                    </TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </SectionCard>

            <SectionCard title={isAdmin ? 'الإيرادات حسب الوحدة (داخلة)' : 'مبيعاتي حسب الوحدة'}>
              {reports.by_unit.length===0 ? <EmptyState title="لا توجد بيانات" /> : (
                <Table>
                  <TableHead><TableRow><TableHeadCell>الوحدة</TableHeadCell><TableHeadCell>مبيعات</TableHeadCell><TableHeadCell>{isAdmin ? 'الإجمالي' : 'إيرادي'}</TableHeadCell></TableRow></TableHead>
                  <TableBody>{reports.by_unit.map(r=>(
                    <TableRow key={r.unit_id}>
                      <TableCell className="font-medium">{r.unit_name}<span className="text-foreground-subtle text-xs ms-2">({r.grade_name})</span></TableCell>
                      <TableCell>{r.purchases}</TableCell>
                      <TableCell dir="ltr" className="font-mono">{formatPrice(isAdmin ? r.total_revenue : r.base_revenue)}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="المبيعات اليومية (آخر 30 يوم)" subtitle="الفلوس الداخلة يوم بيوم">
              {reports.daily.length===0 ? <EmptyState title="لا توجد مبيعات في الفترة" /> : (
                <Table>
                  <TableHead><TableRow><TableHeadCell>التاريخ</TableHeadCell><TableHeadCell>مبيعات</TableHeadCell><TableHeadCell>{isAdmin ? 'الإجمالي' : 'إيرادي'}</TableHeadCell></TableRow></TableHead>
                  <TableBody>{reports.daily.map(r=>(
                    <TableRow key={r.date}><TableCell>{formatDate(r.date)}</TableCell><TableCell>{r.purchases}</TableCell><TableCell dir="ltr" className="font-mono">{formatPrice(isAdmin ? r.total_revenue : r.base_revenue)}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </SectionCard>

            <SectionCard title="حالة الأكواد">
              <div className="grid grid-cols-3 gap-3">
                <div className="glass-soft p-3 text-center"><p className="text-xs text-foreground-subtle">متاح</p><p className="text-xl font-bold">{reports.code_stats.available}</p><p className="text-xs font-mono" dir="ltr">{formatPrice(isAdmin ? reports.code_stats.pending_total : reports.code_stats.pending_base)}</p></div>
                <div className="glass-soft p-3 text-center"><p className="text-xs text-foreground-subtle">مستخدم</p><p className="text-xl font-bold text-success">{reports.code_stats.used}</p></div>
                <div className="glass-soft p-3 text-center"><p className="text-xs text-foreground-subtle">ملغي</p><p className="text-xl font-bold text-error">{reports.code_stats.revoked}</p></div>
              </div>
              <p className="mt-3 text-xs text-foreground-subtle">{isAdmin ? 'المتاح = إيراد متوقع لم يُحصّل بعد (الفلوس المعلقة)' : 'الأكواد المتاحة = مبيعات متوقعة'}</p>
            </SectionCard>
          </div>

          <SectionCard title="آخر المشتريات (فلوس داخلة)">
            {reports.recent_purchases.length===0 ? <EmptyState title="لا توجد مشتريات" /> : (
              <ul className="divide-y divide-border-muted">
                {reports.recent_purchases.map(p=>(
                  <li key={`${p.student_name}-${p.purchased_at}`} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0"><p className="truncate font-medium">{p.student_name}</p><p className="text-xs text-foreground-subtle">{p.grade_name ?? '—'} · {p.unit_name} · {formatDateTime(p.purchased_at)}</p></div>
                    <span className="font-mono text-sm font-bold" dir="ltr">{formatPrice(isAdmin ? p.total_price : p.base_price)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {isAdmin ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SectionCard title="المصروفات (خارجة - تشغيل)" subtitle={`الإجمالي: ${formatPrice(reports.summary.expenses_total)}`}>
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="المبلغ" type="number" value={expenseAmount} onChange={e=>setExpenseAmount(e.target.value)} placeholder="مثال 500" />
                    <Input label="الفئة" value={expenseCat} onChange={e=>setExpenseCat(e.target.value)} placeholder="Bunny / إعلانات" />
                  </div>
                  <Input label="الوصف" value={expenseDesc} onChange={e=>setExpenseDesc(e.target.value)} placeholder="اختياري" />
                  <Button loading={expenseBusy} onClick={handleAddExpense}>تسجيل مصروف</Button>
                  {expenses.length===0 ? <p className="text-sm text-foreground-subtle py-2">لا مصروفات في الفترة</p> : (
                    <Table dense>
                      <TableHead><TableRow><TableHeadCell>التاريخ</TableHeadCell><TableHeadCell>الفئة</TableHeadCell><TableHeadCell>المبلغ</TableHeadCell></TableRow></TableHead>
                      <TableBody>{expenses.map(e=>(
                        <TableRow key={e.id}><TableCell>{formatDate(e.spent_at)}</TableCell><TableCell>{e.category}</TableCell><TableCell dir="ltr" className="font-mono">{formatPrice(e.amount)}</TableCell></TableRow>
                      ))}</TableBody>
                    </Table>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="التحويلات لمستر وليد (خارجة)" subtitle={`الإجمالي: ${formatPrice(reports.summary.payouts_total)}`}>
                <div className="flex flex-col gap-2">
                  <Input label="المبلغ" type="number" value={payoutAmount} onChange={e=>setPayoutAmount(e.target.value)} placeholder="مثال 10000" />
                  <Input label="ملاحظة" value={payoutNote} onChange={e=>setPayoutNote(e.target.value)} placeholder="تحويل شهر 8" />
                  <Button loading={payoutBusy} onClick={handleAddPayout}>تسجيل تحويل</Button>
                  {payouts.length===0 ? <p className="text-sm text-foreground-subtle py-2">لا تحويلات في الفترة</p> : (
                    <Table dense>
                      <TableHead><TableRow><TableHeadCell>التاريخ</TableHeadCell><TableHeadCell>المبلغ</TableHeadCell><TableHeadCell>ملاحظة</TableHeadCell></TableRow></TableHead>
                      <TableBody>{payouts.map(p=>(
                        <TableRow key={p.id}><TableCell>{formatDate(p.paid_at)}</TableCell><TableCell dir="ltr" className="font-mono">{formatPrice(p.amount)}</TableCell><TableCell>{p.note ?? '—'}</TableCell></TableRow>
                      ))}</TableBody>
                    </Table>
                  )}
                </div>
              </SectionCard>
            </div>
          ) : null}
        </>
      )}
      </div>
    </LayoutShell>
  );
}
