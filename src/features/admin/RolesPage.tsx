import { useCallback, useEffect, useState } from 'react';

import { AdminNav } from '../../components/AdminNav';
import { Badge, type BadgeVariant } from '../../components/Badge';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { Modal } from '../../components/Modal';
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
import { setUserRole } from '../../data/rpc';
import { getSupabaseClient } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import type { Profile, UserRole } from '../../types/database';

const ROLE_LABELS: Record<UserRole, string> = {
  student: 'طالب',
  teacher: 'مدرس',
  mr_walid: 'الأستاذ وليد',
  admin: 'مشرف',
};

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'student', label: 'طالب' },
  { value: 'teacher', label: 'مدرس' },
  { value: 'mr_walid', label: 'الأستاذ وليد' },
  { value: 'admin', label: 'مشرف' },
];

function RoleBadge({ role }: { role: UserRole }) {
  const variant: BadgeVariant =
    role === 'admin' ? 'success' : role === 'mr_walid' ? 'warning' : role === 'teacher' ? 'info' : 'neutral';
  return (
    <Badge variant={variant} data-testid={`role-badge-${role}`}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}

export function RolesPage() {
  const { showToast } = useToast();
  const { session } = useAuth();
  const [users, setUsers] = useState<Profile[] | null>(null);
  const [error, setError] = useState(false);
  const [candidate, setCandidate] = useState<{ user: Profile; role: UserRole } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const { data, error: queryError } = await getSupabaseClient()
        .from('profiles')
        .select('*')
        .neq('role', 'student')
        .is('deleted_at', null)
        .order('full_name', { ascending: true });
      if (queryError) {
        throw queryError;
      }
      setUsers((data ?? []) as Profile[]);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConfirm = async () => {
    if (!candidate) {
      return;
    }
    setBusy(true);
    try {
      await setUserRole(candidate.user.id, candidate.role);
      showToast(`تم تحديث دور ${candidate.user.full_name}`);
      setCandidate(null);
      await load();
    } catch {
      showToast('تعذر تحديث الدور. حاول مرة أخرى', 'error');
      setCandidate(null);
    } finally {
      setBusy(false);
    }
  };

  const currentUserId = session?.user?.id;

  return (
    <LayoutShell
      title="الأدوار والصلاحيات"
      subtitle="إدارة أدوار المستخدمين (الأستاذ / المشرف / طالب)"
      variant="sidebar"
      nav={<AdminNav />}
    >
      <Card
        title="المستخدمون غير الطلاب"
        subtitle="تغيير الدور يُسجل في سجل النشاطات ولا يمكن القيام به إلا بواسطة مشرف"
      >
        {error ? (
          <ErrorState message="تعذر تحميل المستخدمين" onRetry={() => void load()} />
        ) : users === null ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <EmptyState title="لا يوجد مستخدمون" description="لم يُعثر على مستخدمين بغير دور طالب." />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>الاسم</TableHeadCell>
                <TableHeadCell>الهاتف</TableHeadCell>
                <TableHeadCell>الدور الحالي</TableHeadCell>
                <TableHeadCell>تغيير الدور إلى</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} data-testid={`role-row-${user.id}`}>
                  <TableCell label="الاسم" className="font-medium text-foreground">
                    {user.full_name}
                  </TableCell>
                  <TableCell label="الهاتف" className="font-mono" dir="ltr">
                    {user.phone}
                  </TableCell>
                  <TableCell label="الدور الحالي">
                    <RoleBadge role={user.role} />
                  </TableCell>
                  <TableCell label="تغيير الدور إلى">
                    <div className="flex flex-col gap-1">
                      <Select
                        label={`تغيير دور ${user.full_name}`}
                        value={user.role}
                        disabled={user.id === currentUserId}
                        className="disabled:bg-surface-muted disabled:text-foreground-subtle"
                        onChange={(event) => {
                          const next = event.target.value as UserRole;
                          if (next !== user.role) {
                            setCandidate({ user, role: next });
                          }
                        }}
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                      {user.id === currentUserId ? (
                        <p className="text-xs text-foreground-subtle">لا يمكنك تغيير دورك بنفسك</p>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal
        open={candidate !== null}
        title="تغيير الدور"
        description={
          candidate
            ? `سيصبح دور ${candidate.user.full_name} «${ROLE_LABELS[candidate.role]}». تبديل صلاحيات المستخدم فوري ويُسجل في السجل.`
            : ''
        }
        confirmLabel="نعم، تغيير"
        loading={busy}
        onConfirm={() => void handleConfirm()}
        onCancel={() => {
          if (!busy) {
            setCandidate(null);
          }
        }}
      />
    </LayoutShell>
  );
}
