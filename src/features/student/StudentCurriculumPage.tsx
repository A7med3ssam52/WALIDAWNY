import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { Skeleton } from '../../components/Skeleton';
import { StudentNav } from '../../components/StudentNav';
import {
  getGradeById,
  listLessonsForUnit,
  listMyProgress,
  listUnitsForGrade,
} from '../../data/rpc';
import type { Grade, Lesson, Progress, Unit } from '../../types/database';
import { useAuth } from '../auth/AuthContext';

interface UnitWithLessons extends Unit {
  lessons: Lesson[];
}

function LessonProgressBadge({ progress }: { progress: Progress | undefined }) {
  if (!progress) {
    return (
      <Badge variant="neutral" outline>
        جديد
      </Badge>
    );
  }
  if (progress.is_completed) {
    return <Badge variant="success">مكتمل</Badge>;
  }
  return <Badge variant="warning">{Math.round(progress.percent_completed)}٪</Badge>;
}

function CurriculumSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="glass-card space-y-3 p-4 sm:p-6">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-2 w-full" />
      </div>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="glass-card space-y-3 p-4 sm:p-6"
        >
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function StudentCurriculumPage() {
  const { profile } = useAuth();
  const [grade, setGrade] = useState<Grade | null | undefined>(undefined);
  const [units, setUnits] = useState<UnitWithLessons[]>([]);
  const [progressByLesson, setProgressByLesson] = useState<Map<string, Progress>>(new Map());
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.grade_id) {
      setGrade(null);
      setUnits([]);
      return;
    }
    setError(false);
    try {
      const gradeRow = await getGradeById(profile.grade_id);
      const [allUnits, progressRows] = await Promise.all([
        listUnitsForGrade(profile.grade_id as string),
        listMyProgress(),
      ]);
      const publishedUnits = allUnits
        .filter((unit) => unit.status === 'published')
        .sort((a, b) => a.sort_order - b.sort_order);
      const withLessons = await Promise.all(
        publishedUnits.map(async (unit) => {
          const lessons = (await listLessonsForUnit(unit.id))
            .filter((lesson) => lesson.status === 'published')
            .sort((a, b) => a.sort_order - b.sort_order);
          return { ...unit, lessons };
        }),
      );
      setGrade(gradeRow);
      setUnits(withLessons);
      setProgressByLesson(new Map(progressRows.map((row) => [row.lesson_id, row])));
    } catch {
      setError(true);
    }
  }, [profile?.grade_id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <LayoutShell title="المنهج الدراسي" variant="sidebar" nav={<StudentNav />}>
        <ErrorState message="تعذر تحميل المنهج الدراسي" onRetry={() => void load()} />
      </LayoutShell>
    );
  }

  if (grade === undefined) {
    return (
      <LayoutShell title="المنهج الدراسي" variant="sidebar" nav={<StudentNav />}>
        <CurriculumSkeleton />
      </LayoutShell>
    );
  }

  if (grade === null) {
    return (
      <LayoutShell title="المنهج الدراسي" variant="sidebar" nav={<StudentNav />}>
        <EmptyState
          icon={<GraduationCap className="h-6 w-6" />}
          title="لم يتم تحديد صفك الدراسي"
          description="تواصل مع الأستاذ لتحديد الصف الدراسي الخاص بك ثم حاول مرة أخرى."
        />
      </LayoutShell>
    );
  }

  const totalLessons = units.reduce((sum, unit) => sum + unit.lessons.length, 0);
  const completedLessons = units.reduce(
    (sum, unit) =>
      sum + unit.lessons.filter((lesson) => progressByLesson.get(lesson.id)?.is_completed).length,
    0,
  );
  const progressPercent =
    totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  return (
    <LayoutShell
      title="المنهج الدراسي"
      subtitle={`${grade.name} — ${totalLessons} درسًا`}
      variant="sidebar" nav={<StudentNav />}
    >
      <div className="flex flex-col gap-4">
        <Card title="تقدمك">
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10 shadow-[inset_0_1px_2px_rgba(2,1,10,0.6)]">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${progressPercent}%` }}
                data-testid="curriculum-progress-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={totalLessons}
                aria-valuenow={completedLessons}
                aria-label="تقدمك في المنهج"
              />
            </div>
            <span
              className="text-sm font-medium text-foreground-muted"
              data-testid="curriculum-progress-label"
            >
              {completedLessons} من {totalLessons} درسًا
            </span>
          </div>
        </Card>

        {units.length === 0 ? (
          <EmptyState
            title="لا توجد دروس بعد"
            description="لم يتم نشر أي وحدات في صفك الدراسي حتى الآن."
          />
        ) : (
          units.map((unit) => (
            <Card key={unit.id} title={unit.name}>
              <ul className="divide-y divide-border-muted">
                {unit.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <Link
                      to={`/student/lessons/${lesson.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
                      data-testid={`curriculum-lesson-${lesson.id}`}
                    >
                      <span className="text-sm text-foreground">{lesson.title}</span>
                      <LessonProgressBadge progress={progressByLesson.get(lesson.id)} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))
        )}
      </div>
    </LayoutShell>
  );
}
