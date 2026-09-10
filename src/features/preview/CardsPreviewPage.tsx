import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Copy,
  Eye,
  GraduationCap,
  KeyRound,
  Pause,
  Phone,
  Play,
  Sparkles,
  Trash2,
  Calendar,
  Hash,
} from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { LayoutShell } from '../../components/LayoutShell';
import { RoleNav } from '../../components/RoleNav';
import { StatusBadge } from '../../components/StatusBadge';

// --- mock data ---
const mockCodes = [
  {
    id: 'c1',
    code: 'A7B2-X9K4-P2L8',
    unit: 'الوحدة الأولى - الجبر',
    grade: 'الصف الثالث الإعدادي',
    status: 'available' as const,
    note: 'مجموعة أ',
    createdAt: '2026-03-01',
    usedBy: null,
  },
  {
    id: 'c2',
    code: 'Q3M8-N5V1-R9T2',
    unit: 'الوحدة الثانية - الهندسة',
    grade: 'الصف الثالث الإعدادي',
    status: 'used' as const,
    note: '—',
    createdAt: '2026-02-28',
    usedBy: 'أحمد محمد',
  },
  {
    id: 'c3',
    code: 'Z6L1-W4E9-K8Q3',
    unit: 'الوحدة الأولى - الجبر',
    grade: 'الصف الثالث الإعدادي',
    status: 'revoked' as const,
    note: 'ملغي',
    createdAt: '2026-02-27',
    usedBy: null,
  },
];

const mockStudents = [
  {
    id: 's1',
    name: 'أحمد محمد أحمد',
    phone: '01012345678',
    status: 'active' as const,
    grade: 'الثالث الإعدادي',
    createdAt: '2026-02-10',
    avatar: 'أ',
  },
  {
    id: 's2',
    name: 'سارة علي حسن',
    phone: '01198765432',
    status: 'active' as const,
    grade: 'الثالث الإعدادي',
    createdAt: '2026-02-12',
    avatar: 'س',
  },
  {
    id: 's3',
    name: 'محمد وليد',
    phone: '01234567890',
    status: 'disabled' as const,
    grade: 'الثاني الإعدادي',
    createdAt: '2026-01-28',
    avatar: 'م',
  },
];

type Variant = 'executive' | 'stacked' | 'ticket' | 'bento' | 'split';

const variants: Array<{ id: Variant; label: string; desc: string }> = [
  { id: 'executive', label: '1- الصف التنفيذي', desc: 'Executive Row — نفس روح وحدات المنهج الجديد' },
  { id: 'stacked', label: '2- البطاقة المكدسة', desc: 'Stacked — كل حقل label فوق value' },
  { id: 'ticket', label: '3- التذكرة', desc: 'Ticket Stub — للكود كبطل' },
  { id: 'bento', label: '4- البنتو', desc: 'Bento Grid — شبكة 2×2' },
  { id: 'split', label: '5- المنقسمة', desc: 'Split — محتوى + شريط أيقونات عمودي' },
];

// ---------- helpers ----------
function CodeBadge({ status }: { status: (typeof mockCodes)[number]['status'] }) {
  if (status === 'used') return <Badge variant="info">مستخدم</Badge>;
  if (status === 'revoked') return <Badge variant="neutral">ملغي</Badge>;
  return <Badge variant="success">متاح</Badge>;
}

// ---------- variant renderers ----------
function ExecutiveCodeCard({ c }: { c: (typeof mockCodes)[number] }) {
  return (
    <div className="glass-soft group flex flex-col overflow-hidden rounded-2xl border border-white/8 transition-all hover:border-violet-400/20">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 text-violet-300">
          <KeyRound className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code dir="ltr" className="truncate font-mono text-[13px] font-bold text-foreground">
              {c.code}
            </code>
            <CodeBadge status={c.status} />
          </div>
          <p className="truncate text-xs text-foreground-subtle">
            {c.grade} — {c.unit}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-white/[0.06] bg-white/[0.02] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="hidden text-xs text-foreground-subtle sm:block">
          {c.createdAt} {c.note !== '—' ? `• ${c.note}` : ''}
        </span>
        <div className="grid grid-cols-3 gap-1.5 sm:flex">
          <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} className="h-8 rounded-xl border border-white/8 bg-white/[0.03] text-xs">
            نسخ
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} className="h-8 rounded-xl border border-rose-400/10 bg-rose-500/5 text-xs text-rose-300">
            إلغاء
          </Button>
          <span className="hidden sm:inline-flex items-center rounded-xl bg-white/5 px-2 text-xs text-foreground-muted">{c.usedBy ?? '—'}</span>
        </div>
      </div>
    </div>
  );
}
function ExecutiveStudentCard({ s }: { s: (typeof mockStudents)[number] }) {
  return (
    <div className="glass-soft group flex flex-col overflow-hidden rounded-2xl border border-white/8 transition-all hover:border-indigo-400/20">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/25 to-violet-500/25 text-sm font-bold text-indigo-200">
          {s.avatar}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{s.name}</span>
            <StatusBadge status={s.status} deleted={false} />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-foreground-subtle" dir="ltr">
            <Phone className="h-3 w-3" /> {s.phone} <span className="text-white/20">•</span> {s.grade}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-white/[0.06] bg-white/[0.02] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="hidden items-center gap-1 text-xs text-foreground-subtle sm:flex">
          <Calendar className="h-3 w-3" /> {s.createdAt}
        </span>
        <div className="grid grid-cols-3 gap-1.5 sm:flex">
          <Link to="#" className="inline-flex h-8 items-center justify-center gap-1 rounded-xl bg-indigo-500 px-3 text-xs font-bold text-white">
            <Eye className="h-3.5 w-3.5" /> عرض
          </Link>
          <Button size="sm" variant="ghost" icon={s.status === 'active' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} className="h-8 rounded-xl border border-white/8 bg-white/[0.03] text-xs">
            {s.status === 'active' ? 'إيقاف' : 'تفعيل'}
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} className="h-8 rounded-xl border border-rose-400/10 bg-rose-500/5 text-xs text-rose-300">
            حذف
          </Button>
        </div>
      </div>
    </div>
  );
}

function StackedCodeCard({ c }: { c: (typeof mockCodes)[number] }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-violet-300" />
          <code dir="ltr" className="font-mono text-sm font-bold text-foreground">
            {c.code}
          </code>
        </div>
        <CodeBadge status={c.status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/[0.03] p-3">
          <dt className="text-[11px] text-foreground-subtle">الوحدة</dt>
          <dd className="mt-1 text-xs font-medium text-foreground">{c.unit}</dd>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <dt className="text-[11px] text-foreground-subtle">الصف</dt>
          <dd className="mt-1 text-xs font-medium text-foreground">{c.grade}</dd>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <dt className="text-[11px] text-foreground-subtle">تاريخ الإنشاء</dt>
          <dd className="mt-1 text-xs text-foreground-muted">{c.createdAt}</dd>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <dt className="text-[11px] text-foreground-subtle">الطالب</dt>
          <dd className="mt-1 text-xs text-foreground-muted">{c.usedBy ?? '—'}</dd>
        </div>
      </dl>
      <div className="mt-3 flex gap-2 border-t border-white/5 pt-3">
        <Button size="sm" variant="secondary" className="flex-1">
          <Copy className="h-4 w-4" /> نسخ
        </Button>
        <Button size="sm" variant="ghost" className="flex-1 text-rose-300">
          <Trash2 className="h-4 w-4" /> إلغاء
        </Button>
      </div>
    </div>
  );
}
function StackedStudentCard({ s }: { s: (typeof mockStudents)[number] }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white">
          {s.avatar}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{s.name}</p>
          <p className="text-xs text-foreground-subtle">{s.grade}</p>
        </div>
        <StatusBadge status={s.status} deleted={false} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/[0.03] p-3">
          <dt className="flex items-center gap-1 text-[11px] text-foreground-subtle">
            <Phone className="h-3 w-3" /> الهاتف
          </dt>
          <dd dir="ltr" className="mt-1 text-xs font-medium text-foreground">
            {s.phone}
          </dd>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <dt className="flex items-center gap-1 text-[11px] text-foreground-subtle">
            <Calendar className="h-3 w-3" /> التسجيل
          </dt>
          <dd className="mt-1 text-xs text-foreground-muted">{s.createdAt}</dd>
        </div>
      </dl>
      <div className="mt-3 flex gap-2 border-t border-white/5 pt-3">
        <Button size="sm" variant="secondary" className="flex-1">
          <Eye className="h-4 w-4" /> تفاصيل
        </Button>
        <Button size="sm" variant="ghost" className="text-rose-300">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TicketCodeCard({ c }: { c: (typeof mockCodes)[number] }) {
  return (
    <div className="relative flex overflow-hidden rounded-2xl border border-white/10">
      <div className="flex-1 bg-gradient-to-br from-violet-600/15 via-indigo-600/10 to-transparent p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-widest text-violet-300">
          <Sparkles className="h-3 w-3" /> كود التفعيل
        </div>
        <code dir="ltr" className="mt-2 block font-mono text-[18px] font-black tracking-widest text-foreground">
          {c.code}
        </code>
        <p className="mt-1 text-xs text-foreground-subtle">
          {c.grade} • {c.unit}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <CodeBadge status={c.status} />
          <span className="text-xs text-foreground-muted">{c.createdAt}</span>
        </div>
      </div>
      <div className="relative flex w-px shrink-0 flex-col items-center justify-center border-x border-dashed border-white/15 bg-white/[0.02]">
        <span className="absolute -top-2 h-4 w-4 rounded-full border border-white/10 bg-[#0a0a1a]" />
        <span className="absolute -bottom-2 h-4 w-4 rounded-full border border-white/10 bg-[#0a0a1a]" />
      </div>
      <div className="flex w-[96px] shrink-0 flex-col gap-2 bg-white/[0.02] p-3">
        <Button size="sm" variant="secondary" className="h-9 w-full text-xs">
          <Copy className="h-3.5 w-3.5" /> نسخ
        </Button>
        <Button size="sm" variant="ghost" className="h-9 w-full text-xs text-rose-300">
          <Trash2 className="h-3.5 w-3.5" /> إلغاء
        </Button>
        <span className="mt-auto text-center text-[11px] text-foreground-subtle">{c.note}</span>
      </div>
    </div>
  );
}
function TicketStudentCard({ s }: { s: (typeof mockStudents)[number] }) {
  return (
    <div className="relative flex overflow-hidden rounded-2xl border border-white/10">
      <div className="flex-1 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
            {s.avatar}
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">{s.name}</p>
            <p className="text-xs text-foreground-subtle">{s.grade}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs text-foreground-muted" dir="ltr">
            <Phone className="h-3 w-3" /> {s.phone}
          </span>
          <StatusBadge status={s.status} deleted={false} />
        </div>
      </div>
      <div className="relative w-px border-x border-dashed border-white/10" />
      <div className="flex w-[96px] flex-col gap-2 bg-white/[0.02] p-3">
        <Button size="sm" variant="secondary" className="h-9 w-full text-xs">
          <Eye className="h-3.5 w-3.5" /> عرض
        </Button>
        <Button size="sm" variant="ghost" className="h-9 w-full text-xs text-rose-300">
          <Trash2 className="h-3.5 w-3.5" /> حذف
        </Button>
      </div>
    </div>
  );
}

function BentoCodeCard({ c }: { c: (typeof mockCodes)[number] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2 flex flex-col justify-between rounded-2xl border border-violet-400/15 bg-gradient-to-br from-violet-600/15 to-indigo-600/10 p-4">
        <code dir="ltr" className="font-mono text-base font-black tracking-widest text-foreground">
          {c.code}
        </code>
        <p className="mt-1 text-xs text-foreground-subtle">{c.unit}</p>
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
        <p className="text-[11px] text-foreground-subtle">الحالة</p>
        <div className="mt-1">
          <CodeBadge status={c.status} />
        </div>
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
        <p className="text-[11px] text-foreground-subtle">التاريخ</p>
        <p className="mt-1 text-xs text-foreground-muted">{c.createdAt}</p>
      </div>
    </div>
  );
}
function BentoStudentCard({ s }: { s: (typeof mockStudents)[number] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2 flex items-center gap-3 rounded-2xl border border-indigo-400/15 bg-gradient-to-br from-indigo-600/15 to-violet-600/10 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-sm font-bold text-white">
          {s.avatar}
        </span>
        <div>
          <p className="text-sm font-bold text-foreground">{s.name}</p>
          <p className="text-xs text-foreground-subtle">{s.grade}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
        <p className="flex items-center gap-1 text-[11px] text-foreground-subtle">
          <Phone className="h-3 w-3" /> هاتف
        </p>
        <p dir="ltr" className="mt-1 text-xs font-medium text-foreground">
          {s.phone}
        </p>
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
        <p className="text-[11px] text-foreground-subtle">الحالة</p>
        <div className="mt-1">
          <StatusBadge status={s.status} deleted={false} />
        </div>
      </div>
    </div>
  );
}

function SplitCodeCard({ c }: { c: (typeof mockCodes)[number] }) {
  return (
    <div className="flex overflow-hidden rounded-2xl border border-white/8">
      <div className="min-w-0 flex-1 p-4">
        <code dir="ltr" className="font-mono text-sm font-bold text-foreground">
          {c.code}
        </code>
        <p className="mt-1 text-xs text-foreground-subtle">
          {c.grade} — {c.unit}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <CodeBadge status={c.status} />
          <span className="text-xs text-foreground-muted">{c.createdAt}</span>
        </div>
      </div>
      <div className="flex w-[64px] shrink-0 flex-col divide-y divide-white/5 border-s border-white/8 bg-white/[0.02]">
        <button className="flex flex-1 flex-col items-center justify-center gap-1 text-foreground-muted hover:bg-white/5 hover:text-foreground" aria-label="نسخ">
          <Copy className="h-4 w-4" />
          <span className="text-[10px]">نسخ</span>
        </button>
        <button className="flex flex-1 flex-col items-center justify-center gap-1 text-rose-300 hover:bg-rose-500/10" aria-label="إلغاء">
          <Trash2 className="h-4 w-4" />
          <span className="text-[10px]">إلغاء</span>
        </button>
      </div>
    </div>
  );
}
function SplitStudentCard({ s }: { s: (typeof mockStudents)[number] }) {
  return (
    <div className="flex overflow-hidden rounded-2xl border border-white/8">
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-foreground">
            {s.avatar}
          </span>
          <p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
          <StatusBadge status={s.status} deleted={false} />
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-foreground-subtle" dir="ltr">
          <Phone className="h-3 w-3" /> {s.phone} • {s.grade}
        </p>
      </div>
      <div className="flex w-[64px] shrink-0 flex-col divide-y divide-white/5 border-s border-white/8 bg-white/[0.02]">
        <Link to="#" className="flex flex-1 flex-col items-center justify-center gap-1 text-indigo-300 hover:bg-white/5">
          <Eye className="h-4 w-4" />
          <span className="text-[10px]">عرض</span>
        </Link>
        <button className="flex flex-1 flex-col items-center justify-center gap-1 text-rose-300 hover:bg-rose-500/10">
          <Trash2 className="h-4 w-4" />
          <span className="text-[10px]">حذف</span>
        </button>
      </div>
    </div>
  );
}

export function CardsPreviewPage() {
  const [active, setActive] = useState<Variant>('executive');

  return (
    <LayoutShell title="معاينة البطاقات" subtitle="5 أشكال مقترحة للأكواد والطلاب — اختر للمعاينة" variant="sidebar" nav={<RoleNav />}>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="أشكال البطاقات">
        {variants.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={active === v.id}
            onClick={() => setActive(v.id)}
            className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${active === v.id ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg' : 'glass-soft text-foreground-muted hover:text-foreground'}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <Card title={variants.find((v) => v.id === active)?.label} subtitle={variants.find((v) => v.id === active)?.desc}>
        <div className="flex flex-col gap-8">
          {/* Codes */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
              <KeyRound className="h-4 w-4 text-violet-300" /> الأكواد — 3 حالات
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {mockCodes.map((c) => (
                <div key={c.id}>
                  {active === 'executive' && <ExecutiveCodeCard c={c} />}
                  {active === 'stacked' && <StackedCodeCard c={c} />}
                  {active === 'ticket' && <TicketCodeCard c={c} />}
                  {active === 'bento' && <BentoCodeCard c={c} />}
                  {active === 'split' && <SplitCodeCard c={c} />}
                </div>
              ))}
            </div>
          </div>

          {/* Students */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
              <GraduationCap className="h-4 w-4 text-indigo-300" /> الطلاب — 3 حالات
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {mockStudents.map((s) => (
                <div key={s.id}>
                  {active === 'executive' && <ExecutiveStudentCard s={s} />}
                  {active === 'stacked' && <StackedStudentCard s={s} />}
                  {active === 'ticket' && <TicketStudentCard s={s} />}
                  {active === 'bento' && <BentoStudentCard s={s} />}
                  {active === 'split' && <SplitStudentCard s={s} />}
                </div>
              ))}
            </div>
          </div>

          {/* dense table fallback hint */}
          <div className="rounded-xl border border-amber-400/15 bg-amber-500/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
              <Hash className="h-4 w-4" /> ملاحظة تنفيذية
            </p>
            <p className="mt-1 text-xs leading-6 text-foreground-muted">
              كل الأشكال تحافظ على نفس البيانات والأزرار (نسخ/إلغاء/عرض/إيقاف/حذف) — الفرق فقط في التخطيط والـ Tailwind. على الديسكتوب يمكن الإبقاء على <code className="rounded bg-white/10 px-1">Table</code> وإظهار البطاقات فقط على <code className="rounded bg-white/10 px-1">lg:hidden</code>.
            </p>
          </div>
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/walid/codes" className="glass-soft rounded-xl px-4 py-2 text-sm font-semibold text-foreground-muted hover:text-foreground">
          → الذهاب للأكواد الحالية
        </Link>
        <Link to="/walid/students" className="glass-soft rounded-xl px-4 py-2 text-sm font-semibold text-foreground-muted hover:text-foreground">
          → الذهاب للطلاب الحاليين
        </Link>
      </div>
    </LayoutShell>
  );
}
