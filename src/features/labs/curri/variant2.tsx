import { Lock, Play } from 'lucide-react';

import { LAB_CURRI_OVERALL, LAB_CURRI_UNITS } from './curriLabsData';
import { CurriShell, ProgressRing } from './mockKit';

/**
 * Labs curri variant 2 — شبكة البطاقات.
 * كروت وحدات شبكية بأغلفة متدرجة وحلقة تقدم لكل وحدة.
 * UI mock only: no backend, no persistence, noindex.
 */
export function Curri2() {
  return (
    <CurriShell testId="labs-curri2">
      <div className="flex items-center gap-4 rounded-3xl border border-border bg-surface p-5 shadow-medium">
        <ProgressRing percent={LAB_CURRI_OVERALL.percent} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-black text-foreground">تقدمك الكلي</h3>
          <p className="text-xs text-foreground-muted">
            {LAB_CURRI_OVERALL.completed} من {LAB_CURRI_OVERALL.total} درسًا مكتمل — كمّل يا بطل
          </p>
        </div>
        <span className="hidden shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-black text-primary-foreground sm:block">
          أكمل الدروس
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {LAB_CURRI_UNITS.map((unit) => {
          const done = unit.lessons.filter((l) => l.status === 'completed').length;
          const percent = Math.round((done / Math.max(1, unit.lessons.length)) * 100);
          return (
            <article
              key={unit.id}
              data-testid={`labs-curri2-unit-${unit.id}`}
              className="group overflow-hidden rounded-3xl border border-border bg-surface shadow-medium transition-transform hover:-translate-y-0.5"
            >
              <div className="relative p-5 pb-4" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${unit.accent} 18%, transparent), transparent 70%)` }}>
                <div className="flex items-start justify-between gap-3">
                  <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface text-2xl shadow-sm">
                    {unit.icon}
                  </span>
                  {unit.locked ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-black text-foreground-muted">
                      <Lock aria-hidden="true" className="h-3 w-3" />
                      {unit.price}
                    </span>
                  ) : unit.isFree ? (
                    <span className="rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-black text-success">مجانية</span>
                  ) : (
                    <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-black tabular-nums text-primary-strong">{percent}٪</span>
                  )}
                </div>
                <h4 className="mt-3 font-display text-base font-black leading-7 text-foreground">{unit.name}</h4>
                <p className="mt-0.5 text-xs text-foreground-muted">{unit.lessons.length} دروس · {done} مكتمل</p>
                {!unit.locked ? (
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full transition-[width]" style={{ width: `${percent}%`, backgroundColor: unit.accent }} />
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5 border-t border-border-muted p-3">
                {unit.lessons.slice(0, 3).map((lesson) => (
                  <span key={lesson.id} data-testid={`labs-curri2-lesson-${lesson.id}`} className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-surface-muted">
                    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground-muted">
                      <Play className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-foreground">{lesson.title}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-foreground-subtle">{lesson.duration}</span>
                  </span>
                ))}
                <span className="mt-1 flex gap-2 px-1 pb-1">
                  <span className={`inline-flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-black ${unit.locked ? 'border border-border bg-surface-muted text-foreground-muted' : 'btn-primary'}`}>
                    {unit.locked ? 'فعّل بكود' : 'افتح الوحدة'}
                  </span>
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </CurriShell>
  );
}
