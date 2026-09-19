import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ClipboardList, Timer } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LayoutShell } from '../../components/LayoutShell';
import { Skeleton } from '../../components/Skeleton';
import { StudentNav } from '../../components/StudentNav';
import { listGeneralExams } from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type { GeneralExamRow } from '../../types/database';
import { GENERAL_EXAM_TIME_LABELS, getGeneralExamTimeState } from '../exams/generalExamUtils';

function stateBadge(exam: GeneralExamRow) {
  const state = getGeneralExamTimeState(exam);
  if (state === 'upcoming') return <Badge variant="info">قادم</Badge>;
  if (state === 'live' || state === 'open') return <Badge variant="success">{GENERAL_EXAM_TIME_LABELS[state]}</Badge>;
  return <Badge variant="neutral">انتهى</Badge>;
}

function actionLabel(exam: GeneralExamRow): string {
  const state = getGeneralExamTimeState(exam);
  if (exam.my_attempt_id) {
    return exam.my_status === 'graded' ? 'عرض النتيجة' : 'عرض المحاولة';
  }
  if (state === 'upcoming') return 'عرض التفاصيل';
  if (state === 'ended') return 'عرض الأوائل';
  return 'ابدأ الامتحان';
}

export function GeneralExamsListPage() {
  const [exams, setExams] = useState<GeneralExamRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setExams(await listGeneralExams());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <LayoutShell
      title="امتحانات الصف"
      subtitle="امتحانات عامة لصفك بميعاد ومؤقت وقايمة أوائل"
      variant="sidebar"
      nav={<StudentNav />}
    >
      <div className="flex flex-col gap-4">
        {loadError ? (
          <ErrorState message="تعذر تحميل الامتحانات" onRetry={() => void load()} />
        ) : exams === null ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : exams.length === 0 ? (
          <EmptyState
            title="لا توجد امتحانات متاحة الآن"
            description="فور نشر امتحان جديد لصفك سيصلك إشعار وسيظهر هنا."
            icon={<ClipboardList aria-hidden="true" className="h-6 w-6" />}
          />
        ) : (
          <ol className="flex flex-col gap-3">
            {exams.map((exam) => (
              <li key={exam.id}>
                <Card padding="sm">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-display text-base font-bold text-foreground">{exam.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-subtle">
                          <span className="flex items-center gap-1">
                            <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
                            {exam.starts_at ? formatDateTime(exam.starts_at) : 'مفتوح'}
                            {' ← '}
                            {exam.ends_at ? formatDateTime(exam.ends_at) : 'بدون نهاية'}
                          </span>
                          {exam.duration_minutes != null ? (
                            <span className="flex items-center gap-1">
                              <Timer aria-hidden="true" className="h-3.5 w-3.5" />
                              {exam.duration_minutes} دقيقة
                            </span>
                          ) : null}
                        </p>
                      </div>
                      {stateBadge(exam)}
                    </div>
                    {exam.my_attempt_id ? (
                      <p className="text-xs font-bold text-emerald-300">
                        {exam.my_status === 'graded' ? 'تم تصحيح محاولتك' : 'أرسلت إجابتك — بانتظار التصحيح'}
                      </p>
                    ) : null}
                    <div>
                      <Link to={`/student/exams/${exam.id}`}>
                        <Button size="sm" variant={exam.my_attempt_id ? 'secondary' : 'primary'}>
                          {actionLabel(exam)}
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>
    </LayoutShell>
  );
}
