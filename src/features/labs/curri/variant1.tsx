import { useState } from 'react';
import { ChevronDown, Flag, Sparkles } from 'lucide-react';

import { LAB_CURRI_OVERALL, LAB_CURRI_TRIALS, LAB_CURRI_UNITS } from './curriLabsData';
import { CurriShell, LessonIcon, ProgressRing, StatusBadge } from './mockKit';
import { cn } from '../../../lib/cn';

/**
 * Labs curri variant 1 — رحلة Timeline.
 * خط زمني رأسي متصل: كل وحدة محطة، والدروس نقط على الخط.
 * UI mock only: no backend, no persistence, noindex.
 */
export function Curri1() {
  const [open, setOpen] = useState<string[]>(['unit-1', 'unit-2']);
  const toggle = (id: string) =>
    setOpen((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]));

  return (
    <CurriShell testId="labs-curri1">
      {/* Hero progress */}
      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-medium">
        <div className="h-1.5 w-full" style={{ background: 'linear-gradient(to left, var(--color-chart-1), var(--color-chart-2), var(--color-gold))' }} aria-hidden="true" />
        <div className="flex items-center gap-4 p-5">
          <ProgressRing percent={LAB_CURRI_OVERALL.percent} size={60} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-black text-foreground-subtle">
              <Flag aria-hidden="true" className="h-3.5 w-3.5 text-primary-strong" />
              رحلتك في المنهج
            </p>
            <h3 className="mt-0.5 font-display text-lg font-black text-foreground">
              {LAB_CURRI_OVERALL.completed} من {LAB_CURRI_OVERALL.total} درسًا
            </h3>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted" role="presentation">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${LAB_CURRI_OVERALL.percent}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Free strip */}
      <div className="flex items-center gap-3 rounded-2xl border border-info/25 bg-info/[0.07] px-4 py-3">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-info/15 text-info">
          <Sparkles className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 text-xs leading-5 text-foreground">
          <span className="font-black">محطتان مجانيتان بانتظارك</span>
          <span className="block text-foreground-muted">{LAB_CURRI_TRIALS.length} دروس للجميع بدون تفعيل</span>
        </p>
        <span className="shrink-0 rounded-full bg-info px-2.5 py-1 text-[11px] font-black text-white">مجاني</span>
      </div>

      {/* Timeline */}
      <ol className="relative flex flex-col gap-4 before:absolute before:bottom-4 before:start-[27px] before:top-4 before:w-0.5 before:rounded-full before:bg-border">
        {LAB_CURRI_UNITS.map((unit, index) => {
          const expanded = open.includes(unit.id);
          const done = unit.lessons.filter((l) => l.status === 'completed').length;
          return (
            <li key={unit.id} data-testid={`labs-curri1-unit-${unit.id}`} className="relative ps-14">
              <span
                aria-hidden="true"
                className="absolute start-3 top-4 flex h-9 w-9 items-center justify-center rounded-2xl border border-border bg-surface text-lg shadow-sm"
              >
                {unit.icon}
              </span>
              <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                <button
                  type="button"
                  onClick={() => toggle(unit.id)}
                  aria-expanded={expanded}
                  data-testid={`labs-curri1-toggle-${unit.id}`}
                  className="flex w-full items-center gap-3 p-4 text-start transition-colors hover:bg-surface-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black text-foreground-subtle">المحطة {index + 1}</p>
                    <h4 className="truncate font-display text-[15px] font-black text-foreground">{unit.name}</h4>
                    <p className="mt-0.5 text-xs text-foreground-muted">
                      {unit.locked ? `مقفولة — ${unit.price}` : `${done} / ${unit.lessons.length} دروس`}
                      {unit.isFree ? ' · مجانية' : ''}
                    </p>
                  </div>
                  <ChevronDown aria-hidden="true" className={cn('h-4 w-4 shrink-0 text-foreground-subtle transition-transform', expanded && 'rotate-180')} />
                </button>
                {expanded ? (
                  <ul className="flex flex-col gap-1 border-t border-border-muted p-2">
                    {unit.lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <span
                          data-testid={`labs-curri1-lesson-${lesson.id}`}
                          className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-muted"
                        >
                          <LessonIcon status={lesson.status} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-foreground">{lesson.title}</span>
                            <span className="mt-0.5 block text-[11px] tabular-nums text-foreground-subtle">{lesson.duration} دقيقة</span>
                          </span>
                          <StatusBadge status={lesson.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </CurriShell>
  );
}
