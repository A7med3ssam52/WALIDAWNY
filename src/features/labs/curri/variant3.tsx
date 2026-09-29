import { useMemo, useState } from 'react';
import { ChevronDown, Lock, Search } from 'lucide-react';

import { LAB_CURRI_OVERALL, LAB_CURRI_UNITS } from './curriLabsData';
import { CurriShell, LessonIcon, ProgressRing, StatusBadge } from './mockKit';
import { cn } from '../../../lib/cn';

/**
 * Labs curri variant 3 — أكورديون مريح (تطوير الحالي).
 * نفس منطق الصفحة الحالية + بحث وفلاتر وهيدر sticky.
 * UI mock only: no backend, no persistence, noindex.
 */
type Filter = 'all' | 'new' | 'progress' | 'done' | 'free';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'الكل' },
  { id: 'done', label: 'مكتمل' },
  { id: 'progress', label: 'جاري' },
  { id: 'new', label: 'جديد' },
  { id: 'free', label: 'مجاني' },
];

export function Curri3() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string[]>(['unit-1']);

  const visible = useMemo(
    () =>
      LAB_CURRI_UNITS.map((unit) => ({
        ...unit,
        lessons: unit.lessons.filter((lesson) => {
          if (query && !lesson.title.includes(query.trim())) return false;
          if (filter === 'done') return lesson.status === 'completed';
          if (filter === 'progress') return lesson.status === 'in-progress';
          if (filter === 'new') return lesson.status === 'new';
          if (filter === 'free') return lesson.status === 'trial-open';
          return true;
        }),
      })),
    [query, filter],
  );

  return (
    <CurriShell testId="labs-curri3">
      <div className="sticky top-0 z-10 rounded-3xl border border-border bg-surface/95 p-4 shadow-medium backdrop-blur">
        <div className="flex items-center gap-3">
          <ProgressRing percent={LAB_CURRI_OVERALL.percent} size={48} />
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-black text-foreground">المنهج الدراسي</h3>
            <p className="text-xs text-foreground-muted">{LAB_CURRI_OVERALL.completed} / {LAB_CURRI_OVERALL.total} درسًا</p>
          </div>
          <span className="shrink-0 rounded-full bg-primary-soft px-3 py-1 text-xs font-black tabular-nums text-primary-strong">
            {LAB_CURRI_OVERALL.percent}٪
          </span>
        </div>
        <div className="relative mt-3">
          <Search aria-hidden="true" className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="دوّر على درس… مثال: كيرشوف"
            aria-label="بحث في الدروس"
            data-testid="labs-curri3-search"
            className="h-11 w-full rounded-xl border border-border bg-input pe-3 ps-10 text-sm text-foreground placeholder:text-foreground-subtle/60 focus:border-primary-strong focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="فلترة الدروس">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              data-testid={`labs-curri3-filter-${f.id}`}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-black transition-colors',
                filter === f.id
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'border-border bg-surface-muted text-foreground-muted hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {visible.map((unit) => {
          const expanded = open.includes(unit.id);
          const done = unit.lessons.filter((l) => l.status === 'completed').length;
          return (
            <section key={unit.id} data-testid={`labs-curri3-unit-${unit.id}`} className="overflow-hidden rounded-2xl border border-border bg-surface">
              <button
                type="button"
                onClick={() => setOpen((p) => (p.includes(unit.id) ? p.filter((u) => u !== unit.id) : [...p, unit.id]))}
                aria-expanded={expanded}
                data-testid={`labs-curri3-toggle-${unit.id}`}
                className="flex w-full items-center gap-3 p-4 text-start hover:bg-surface-muted/50"
              >
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-lg">
                  {unit.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-foreground">
                    {unit.name}
                    {unit.locked ? <Lock aria-label="مقفولة" className="ms-1.5 inline h-3.5 w-3.5 text-foreground-subtle" /> : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-foreground-muted">{done} / {unit.lessons.length} · {unit.locked ? unit.price : 'مفعّلة'}</span>
                </span>
                <ChevronDown aria-hidden="true" className={cn('h-4 w-4 shrink-0 text-foreground-subtle transition-transform', expanded && 'rotate-180')} />
              </button>
              {expanded ? (
                unit.lessons.length === 0 ? (
                  <p className="border-t border-border-muted px-4 py-6 text-center text-xs text-foreground-subtle">لا توجد دروس مطابقة — جرّب كلمة تانية</p>
                ) : (
                  <ul className="divide-y divide-border-muted border-t border-border-muted">
                    {unit.lessons.map((lesson) => (
                      <li key={lesson.id} data-testid={`labs-curri3-lesson-${lesson.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted/60">
                        <LessonIcon status={lesson.status} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-foreground">{lesson.title}</span>
                          <span className="text-[11px] tabular-nums text-foreground-subtle">{lesson.duration}</span>
                        </span>
                        <StatusBadge status={lesson.status} />
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </section>
          );
        })}
      </div>
    </CurriShell>
  );
}
