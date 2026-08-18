import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';

import { Card } from '../../components/Card';
import { DirectionalArrow } from '../../components/DirectionalArrow';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { RoleNav } from '../../components/RoleNav';
import { listGrades } from '../../data/rpc';
import type { Grade } from '../../types/database';
import { ListSkeleton } from './curriculumShared';

export function CurriculumPage() {
  const [grades, setGrades] = useState<Grade[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setGrades(await listGrades());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasGrades = grades !== null && grades.length > 0;

  return (
    <LayoutShell
      title="المنهج"
      subtitle="اختر صفًا للانتقال إلى وحداته ودروسه"
      variant="sidebar"
      nav={<RoleNav />}
    >
      <Card
        title="الصفوف"
        subtitle="انتقل من الصف إلى الوحدات ثم الدروس"
        actions={
          hasGrades ? (
            <Link
              to="/walid/grades"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-primary-strong transition-colors hover:bg-primary-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1 sm:h-10"
            >
              إدارة الصفوف
            </Link>
          ) : undefined
        }
      >
        {error ? (
          <ErrorState message="تعذر تحميل الصفوف" onRetry={() => void load()} />
        ) : grades === null ? (
          <ListSkeleton />
        ) : grades.length === 0 ? (
          <EmptyState
            title="لا توجد صفوف نشطة"
            description="أنشئ صفًا أولاً من صفحة إدارة الصفوف لبدء بناء المنهج."
            action={
              <Link
                to="/walid/grades"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gradient-to-br from-primary to-accent px-4 text-sm font-semibold text-primary-foreground shadow-[0_8px_18px_-6px_rgba(99,102,241,0.5)] transition-[filter] hover:brightness-110"
              >
                <GraduationCap aria-hidden="true" className="h-4 w-4" />
                إدارة الصفوف
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {grades.map((grade) => (
              <li
                key={grade.id}
                data-testid={`grade-row-${grade.id}`}
                className="glass-soft flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 p-3 transition-all duration-200 hover:border-indigo-400/20"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/25 text-indigo-300"
                  >
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {grade.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-foreground-subtle">
                      ترتيب {grade.sort_order}
                    </span>
                  </span>
                </div>
                <Link
                  to={`/walid/curriculum/${grade.id}`}
                  className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-primary-strong transition-colors hover:bg-primary-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1 sm:h-10"
                >
                  فتح الوحدات
                  <DirectionalArrow direction="forward" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </LayoutShell>
  );
}
