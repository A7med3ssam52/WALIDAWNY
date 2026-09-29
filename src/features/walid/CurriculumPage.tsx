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
import { useAuth } from '../auth/AuthContext';
import { ListSkeleton } from './curriculumShared';

export function CurriculumPage() {
  const { role } = useAuth();
  // Assistant policy: curriculum structure is read-only (no grade/unit/lesson
  // CRUD — /walid/grades is staff-only). Exams + lesson assets stay full-write
  // (see ExamsPage / LessonAssetsPage); backend enforces the same boundary.
  const isAssistant = role === 'assistant';
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
          hasGrades && !isAssistant ? (
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
              isAssistant ? undefined : (
                <Link
                  to="/walid/grades"
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-sm font-semibold text-primary-foreground shadow-subtle transition-[filter]"
                >
                  <GraduationCap aria-hidden="true" className="h-4 w-4" />
                  إدارة الصفوف
                </Link>
              )
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {grades.map((grade) => (
              <li
                key={grade.id}
                data-testid={`grade-row-${grade.id}`}
                className="flex border border-border bg-surface-muted flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 transition-all duration-200 hover:border-border"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(147,184,132,0.22)] bg-[rgba(147,184,132,0.12)] text-primary-strong"
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
