import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Search, UserRoundMinus, UserRoundPlus } from 'lucide-react';

import { AvatarImage } from '../../components/AvatarImage';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { RoleNav } from '../../components/RoleNav';
import { Skeleton } from '../../components/Skeleton';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { getGuestStats, listGuests, listStudents, setGuestStatus } from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type { GuestStats, Profile } from '../../types/database';
import { GuestBadge } from './GuestManager';

function GuestsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="glass-card flex flex-col items-center p-5">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="mt-3 h-4 w-32" />
          <Skeleton className="mt-2 h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function GuestsPage() {
  const { showToast } = useToast();
  const [guests, setGuests] = useState<Profile[] | null>(null);
  const [stats, setStats] = useState<GuestStats | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [convertSearch, setConvertSearch] = useState('');
  const [candidates, setCandidates] = useState<Profile[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    setGuests(null);
    try {
      const [nextGuests, nextStats] = await Promise.all([listGuests(false), getGuestStats()]);
      setGuests(nextGuests);
      setStats(nextStats);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadCandidates = useCallback(async () => {
    const query = convertSearch.trim().toLowerCase();
    if (!query) {
      setCandidates(null);
      return;
    }
    try {
      const all = await listStudents();
      setCandidates(
        all
          .filter((student) => !student.is_guest && !student.deleted_at)
          .filter(
            (student) =>
              student.full_name.toLowerCase().includes(query) || student.phone.includes(query),
          )
          .slice(0, 8),
      );
    } catch {
      setCandidates([]);
    }
  }, [convertSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCandidates(), 300);
    return () => window.clearTimeout(timer);
  }, [loadCandidates]);

  const filtered = useMemo(
    () =>
      (guests ?? []).filter((guest) => {
        const query = search.trim().toLowerCase();
        if (!query) return true;
        return (
          guest.full_name.toLowerCase().includes(query) || guest.phone.includes(query)
        );
      }),
    [guests, search],
  );

  const convert = async (student: Profile, toGuest: boolean) => {
    setBusyId(student.id);
    try {
      await setGuestStatus(student.id, toGuest);
      showToast(toGuest ? 'تم تحويل الطالب إلى ضيف' : 'تم إلغاء وضع الضيف');
      setCandidates(null);
      setConvertSearch('');
      await load();
    } catch {
      showToast('تعذر تنفيذ العملية. حاول مرة أخرى', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <LayoutShell
      title="وضع الضيف"
      subtitle="طلبة مخفيون عن الجميع — ظاهرون للإدارة فقط"
      variant="sidebar"
      nav={<RoleNav />}
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="إجمالي الضيوف" value={stats ? String(stats.total_guests) : '…'} />
        <StatCard title="ضيوف نشطون" value={stats ? String(stats.active_guests) : '…'} />
        <StatCard title="وحدات مفعّلة للضيوف" value={stats ? String(stats.guest_purchases) : '…'} />
        <StatCard
          title="مقترحات جديدة من ضيوف"
          value={stats ? String(stats.new_guest_suggestions) : '…'}
        />
      </div>

      <div className="glass-card mb-4 p-4">
        <h2 className="text-sm font-bold text-foreground">تحويل طالب إلى ضيف</h2>
        <p className="mt-1 text-xs text-foreground-muted">
          ابحث بالاسم أو رقم الهاتف، ثم اضغط تحويل. الضيف يختفي فورًا من كل قوائم مستر وليد.
        </p>
        <div className="mt-3 max-w-md">
          <Input
            label="بحث عن طالب"
            name="guest-convert-search"
            icon={<Search className="h-4 w-4" />}
            placeholder="اسم الطالب أو رقم الهاتف"
            value={convertSearch}
            onChange={(event) => setConvertSearch(event.target.value)}
          />
        </div>
        {candidates !== null && convertSearch.trim() ? (
          candidates.length === 0 ? (
            <p className="mt-2 text-xs text-foreground-muted">لا توجد نتائج مطابقة.</p>
          ) : (
            <ul className="mt-2 flex max-w-md flex-col gap-2">
              {candidates.map((student) => (
                <li
                  key={student.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{student.full_name}</p>
                    <p className="text-xs text-foreground-muted" dir="ltr">
                      {student.phone}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busyId === student.id}
                    icon={<UserRoundPlus aria-hidden="true" className="h-4 w-4" />}
                    onClick={() => void convert(student, true)}
                  >
                    تحويل لضيف
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      <div className="mb-4 w-full sm:max-w-xs">
        <Input
          label="بحث في الضيوف"
          name="guest-search"
          icon={<Search className="h-4 w-4" />}
          placeholder="بحث بالاسم أو رقم الهاتف"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error ? (
        <ErrorState message="تعذر تحميل قائمة الضيوف" onRetry={() => void load()} />
      ) : guests === null ? (
        <GuestsSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={guests.length === 0 ? 'لا يوجد ضيوف بعد' : 'لا توجد نتائج مطابقة'}
          description={
            guests.length === 0
              ? 'حوّل أي طالب إلى ضيف من البحث بالأعلى.'
              : 'جرّب تغيير البحث.'
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((guest) => (
            <article
              key={guest.id}
              data-testid={`guest-row-${guest.id}`}
              className="glass-card flex flex-col overflow-hidden"
            >
              <div className="flex flex-col items-center px-4 pt-5 text-center">
                <AvatarImage
                  path={guest.avatar_path}
                  alt={`صورة ${guest.full_name}`}
                  className="h-16 w-16 shrink-0 rounded-full ring-2 ring-warning/50"
                  fallback={
                    <span
                      aria-hidden="true"
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xl font-black text-foreground-muted ring-2 ring-warning/50"
                    >
                      {guest.full_name.trim().charAt(0) || 'ط'}
                    </span>
                  }
                />
                <h3 className="mt-3 w-full truncate text-base font-bold text-foreground">
                  {guest.full_name}
                </h3>
                <div className="mt-1.5 flex items-center gap-2">
                  <GuestBadge />
                  <StatusBadge status={guest.status} deleted={Boolean(guest.deleted_at)} />
                </div>
                <p className="mt-2 text-xs font-semibold tabular-nums text-foreground-muted" dir="ltr">
                  {guest.phone}
                </p>
                <p className="mt-1 text-[11px] text-foreground-subtle">
                  انضم {formatDateTime(guest.created_at)}
                </p>
              </div>
              <div className="mt-auto grid grid-cols-2 divide-x divide-border-muted border-t border-border-muted">
                <Link
                  to={`/walid/students/${guest.id}`}
                  aria-label={`إدارة ${guest.full_name}`}
                  className="flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-primary-strong transition-colors hover:bg-surface-muted focus:outline-none focus-visible:bg-surface-muted"
                >
                  <Eye aria-hidden="true" className="h-4 w-4" />
                  إدارة الوحدات
                </Link>
                <button
                  type="button"
                  onClick={() => void convert(guest, false)}
                  disabled={busyId === guest.id}
                  className="flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-foreground-muted transition-colors hover:bg-surface-muted focus:outline-none disabled:opacity-50"
                >
                  <UserRoundMinus aria-hidden="true" className="h-4 w-4" />
                  {busyId === guest.id ? 'جاري…' : 'إلغاء الضيف'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </LayoutShell>
  );
}
