import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, ClipboardList, Timer } from 'lucide-react';

import { Button } from '../../components/Button';
import { listGeneralExams } from '../../data/rpc';
import { formatDateTime } from '../../lib/format';
import type { GeneralExamRow } from '../../types/database';
import { getGeneralExamTimeState } from '../exams/generalExamUtils';

/** A general exam is "live" when a student can start it right now. */
export function isLiveExam(exam: GeneralExamRow): boolean {
  const state = getGeneralExamTimeState(exam);
  return (state === 'live' || state === 'open') && !exam.my_attempt_id;
}

/**
 * Prominent banner on the student dashboard, visible ONLY while at least
 * one general exam of the student's grade is live and unattempted.
 * Silent when loading, on error, or when nothing is live (non-fatal by
 * design — the dashboard must never break because of this card).
 *
 * `previewExams` bypasses the backend and renders the given rows instead
 * (used by /labs/exam to showcase the card design).
 */
export function LiveExamCard({ previewExams }: { previewExams?: GeneralExamRow[] }) {
  const [live, setLive] = useState<GeneralExamRow[] | null>(null);

  useEffect(() => {
    if (previewExams) return;
    let active = true;
    listGeneralExams()
      .then((rows) => {
        if (active) setLive(rows.filter(isLiveExam));
      })
      .catch(() => {
        if (active) setLive([]);
      });
    return () => {
      active = false;
    };
  }, [previewExams]);

  const display = previewExams ? previewExams.filter(isLiveExam) : live;
  if (!display || display.length === 0) return null;
  const first = display[0];
  const rest = display.length - 1;

  return (
    <section
      aria-label="امتحان جاري الآن"
      data-testid="live-exam-card"
      className="glass-card spotlight-card conic-ring relative overflow-hidden p-5 sm:p-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 start-1/3 h-36 w-36 rounded-full bg-gradient-to-br from-rose-500/20 to-amber-500/10 blur-2xl"
      />
      <div className="relative flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-[0_8px_20px_-8px_rgba(244,63,94,0.6)]">
            <ClipboardList aria-hidden="true" className="h-5 w-5" />
            <span aria-hidden="true" className="absolute -top-1 -end-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-300" />
            </span>
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-black text-amber-300">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-300" />
              امتحان جاري الآن
            </p>
            <h3 className="truncate font-display text-base font-bold text-foreground sm:text-lg">
              {first.title}
            </h3>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-muted">
          {first.ends_at ? (
            <span className="flex items-center gap-1">
              <AlarmClock aria-hidden="true" className="h-3.5 w-3.5" />
              ينتهي {formatDateTime(first.ends_at)}
            </span>
          ) : null}
          {first.duration_minutes != null ? (
            <span className="flex items-center gap-1">
              <Timer aria-hidden="true" className="h-3.5 w-3.5" />
              المدة {first.duration_minutes} دقيقة
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/student/exams/${first.id}`}>
            <Button size="sm">ادخل الامتحان الآن</Button>
          </Link>
          {rest > 0 ? (
            <Link
              to="/student/exams"
              className="text-xs font-bold text-indigo-300 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              و {rest} {rest === 1 ? 'امتحان آخر' : 'امتحانات أخرى'} جارية
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
