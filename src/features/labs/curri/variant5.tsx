import { Check, Lock, Play, Star } from 'lucide-react';

import { LAB_CURRI_UNITS, type LabLesson } from './curriLabsData';
import { CurriShell } from './mockKit';
import { cn } from '../../../lib/cn';

/**
 * Labs curri variant 5 — خريطة الطريق (Gamified).
 * مسار متعرج بالنقط: كل درس عقدة، والمقفول قفل، والمجاني نجمة.
 * UI mock only: no backend, no persistence, noindex.
 */
function Node({ lesson, offset }: { lesson: LabLesson; offset: boolean }) {
  const completed = lesson.status === 'completed';
  const current = lesson.status === 'in-progress';
  const locked = lesson.status === 'locked';
  const trial = lesson.status === 'trial-open';

  return (
    <li
      data-testid={`labs-curri5-lesson-${lesson.id}`}
      className={cn('flex flex-col items-center gap-1.5', offset ? 'translate-x-10 sm:translate-x-16' : '-translate-x-0')}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-full border-4 shadow-medium transition-transform',
          completed && 'border-success bg-success text-white',
          current && 'animate-pulse border-primary-strong bg-primary text-primary-foreground',
          locked && 'border-border bg-surface-muted text-foreground-subtle',
          trial && 'border-info bg-info text-white',
          lesson.status === 'new' && 'border-border bg-surface text-foreground-muted',
        )}
      >
        {completed ? <Check className="h-6 w-6" /> : locked ? <Lock className="h-5 w-5" /> : trial ? <Star className="h-6 w-6" /> : <Play className="h-5 w-5" />}
      </span>
      <span className={cn(
        'max-w-[140px] rounded-xl border px-2.5 py-1.5 text-center text-[11px] font-bold leading-4',
        current ? 'border-primary-strong bg-primary-soft text-foreground' : 'border-border bg-surface text-foreground-muted',
      )}>
        {lesson.title}
      </span>
      <span className="text-[10px] tabular-nums text-foreground-subtle">{lesson.duration}</span>
    </li>
  );
}

export function Curri5() {
  return (
    <CurriShell testId="labs-curri5">
      <div className="rounded-3xl border border-border bg-surface p-5 text-center shadow-medium">
        <p className="text-[11px] font-black text-foreground-subtle">أكمل درسك اليومي</p>
        <h3 className="mt-1 font-display text-xl font-black text-foreground">خطوة بخطوة نحو التفوق</h3>
        <span className="mx-auto mt-3 flex h-12 max-w-xs items-center justify-center rounded-2xl bg-primary text-sm font-black text-primary-foreground">
          أكمل الدرس الحالي — توصيل المقاومات
        </span>
      </div>

      {LAB_CURRI_UNITS.map((unit) => (
        <section key={unit.id} data-testid={`labs-curri5-unit-${unit.id}`} aria-label={unit.name} className="overflow-hidden rounded-3xl border border-border bg-surface-muted/40">
          <div
            className="flex items-center gap-3 border-b border-border-muted px-5 py-3.5"
            style={{ background: `linear-gradient(to left, color-mix(in srgb, ${unit.accent} 20%, transparent), transparent)` }}
          >
            <span aria-hidden="true" className="text-xl">{unit.icon}</span>
            <h4 className="min-w-0 flex-1 truncate font-display text-[15px] font-black text-foreground">{unit.name}</h4>
            {unit.locked ? (
              <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-black text-foreground-muted">🔒 {unit.price}</span>
            ) : unit.isFree ? (
              <span className="shrink-0 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-black text-success">هدية</span>
            ) : (
              <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-black text-primary-strong">
                {unit.lessons.filter((l) => l.status === 'completed').length}/{unit.lessons.length}
              </span>
            )}
          </div>
          <ol className="flex flex-col items-center gap-5 px-4 py-6">
            {unit.lessons.map((lesson, i) => (
              <Node key={lesson.id} lesson={lesson} offset={i % 2 === 1} />
            ))}
          </ol>
        </section>
      ))}

      <p className="rounded-2xl border border-dashed border-border bg-surface p-4 text-center text-xs leading-6 text-foreground-subtle">
        عقدة خضراء = خلصت · نابضة = درسك الحالي · رمادية = مقفولة بكود · ذهبية = مجانية للجميع
      </p>
    </CurriShell>
  );
}
