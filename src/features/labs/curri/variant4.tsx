import { useState } from 'react';
import { Lock } from 'lucide-react';

import { LAB_CURRI_UNITS } from './curriLabsData';
import { CurriShell, LessonIcon, StatusBadge } from './mockKit';
import { cn } from '../../../lib/cn';

/**
 * Labs curri variant 4 — لوحة مقسمة.
 * قائمة وحدات (يمين) + محتوى الدروس (شمال). على الموبايل: شرائح أفقية.
 * UI mock only: no backend, no persistence, noindex.
 */
export function Curri4() {
  const [active, setActive] = useState('unit-1');
  const unit = LAB_CURRI_UNITS.find((u) => u.id === active) ?? LAB_CURRI_UNITS[0];
  const done = unit.lessons.filter((l) => l.status === 'completed').length;
  const percent = Math.round((done / Math.max(1, unit.lessons.length)) * 100);

  return (
    <CurriShell testId="labs-curri4">
      {/* Mobile chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden" role="tablist" aria-label="الوحدات">
        {LAB_CURRI_UNITS.map((u) => (
          <button
            key={u.id}
            role="tab"
            aria-selected={active === u.id}
            data-testid={`labs-curri4-chip-${u.id}`}
            onClick={() => setActive(u.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-black transition-colors',
              active === u.id
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'border-border bg-surface text-foreground-muted',
            )}
          >
            <span aria-hidden="true">{u.icon}</span>
            {u.name.replace('الوحدة ', 'و')}
            {u.locked ? <Lock aria-hidden="true" className="h-3 w-3" /> : null}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <aside className="hidden flex-col gap-2 lg:flex" aria-label="قائمة الوحدات">
          {LAB_CURRI_UNITS.map((u) => {
            const uDone = u.lessons.filter((l) => l.status === 'completed').length;
            const selected = active === u.id;
            return (
              <button
                key={u.id}
                type="button"
                data-testid={`labs-curri4-side-${u.id}`}
                aria-current={selected ? 'true' : undefined}
                onClick={() => setActive(u.id)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-3.5 text-start transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong/50',
                  selected ? 'border-primary-strong bg-primary-soft' : 'border-border bg-surface hover:border-primary/40',
                )}
              >
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-lg">
                  {u.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-foreground">{u.name}</span>
                  <span className="mt-0.5 block text-[11px] text-foreground-muted">
                    {u.locked ? `مقفولة · ${u.price}` : `${uDone}/${u.lessons.length} دروس`}
                  </span>
                  {!u.locked ? (
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((uDone / Math.max(1, u.lessons.length)) * 100)}%` }} />
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
          <div className="rounded-2xl border border-dashed border-border bg-surface-muted/50 p-4 text-center text-[11px] leading-5 text-foreground-subtle">
            فعّل وحدة جديدة بكود من الأستاذ — تظهر هنا فورًا
          </div>
        </aside>

        {/* Content */}
        <section data-testid={`labs-curri4-content-${unit.id}`} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-medium">
          <div className="border-b border-border-muted p-5" style={{ background: `linear-gradient(to left, color-mix(in srgb, ${unit.accent} 14%, transparent), transparent)` }}>
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-2xl">
                {unit.icon}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg font-black text-foreground">{unit.name}</h3>
                <p className="mt-0.5 text-xs text-foreground-muted">
                  {unit.locked ? `وحدة مقفولة — سعرها ${unit.price}` : `${done} من ${unit.lessons.length} دروس · ${percent}٪`}
                </p>
              </div>
            </div>
            {!unit.locked ? (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-warning/30 bg-warning/[0.07] p-3 sm:flex-row">
                <input placeholder="ادخل كود التفعيل" aria-label="كود تفعيل الوحدة" data-testid="labs-curri4-code" className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm focus:border-primary-strong focus:outline-none" />
                <span className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-black text-primary-foreground">تفعيل</span>
              </div>
            )}
          </div>
          <ol className="flex flex-col divide-y divide-border-muted">
            {unit.lessons.map((lesson, i) => (
              <li key={lesson.id} data-testid={`labs-curri4-lesson-${lesson.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-muted/60">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-muted font-display text-[11px] font-black tabular-nums text-foreground-muted">
                  {i + 1}
                </span>
                <LessonIcon status={lesson.status} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-foreground">{lesson.title}</span>
                  <span className="text-[11px] tabular-nums text-foreground-subtle">{lesson.duration} دقيقة</span>
                </span>
                <StatusBadge status={lesson.status} />
              </li>
            ))}
          </ol>
        </section>
      </div>
    </CurriShell>
  );
}
