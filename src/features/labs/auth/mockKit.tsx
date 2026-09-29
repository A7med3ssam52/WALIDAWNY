import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';

import { LAB_DEMO_ERROR, LAB_GRADES } from './authLabsData';

/**
 * Shared mock kit for /labs/auth variants — UI only.
 * Theme tokens only (adapts to all 6 themes), RTL-first, no backend calls.
 */

export function MockShell({
  children,
  testId,
}: {
  children: ReactNode;
  testId: string;
}) {
  return (
    <div dir="rtl" data-testid={testId} className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}

interface MockFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function MockField({ label, hint, id, ...rest }: MockFieldProps) {
  const inputId = id ?? `lab-${label}`;
  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-bold text-foreground">
        {label}
      </label>
      <input
        id={inputId}
        {...rest}
        className="h-11 w-full rounded-xl border border-border bg-input px-3 text-sm text-foreground placeholder:text-foreground-subtle/60 focus:border-primary-strong focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {hint ? <p className="mt-1 text-xs text-foreground-subtle">{hint}</p> : null}
    </div>
  );
}

export function MockError({ message = LAB_DEMO_ERROR }: { message?: string }) {
  return (
    <p
      role="alert"
      className="flex items-center gap-2 rounded-xl border border-error/30 bg-error/[0.06] px-3 py-2.5 text-sm leading-6 font-medium text-error"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-error" />
      {message}
    </p>
  );
}

/** Fake submit: loading ~900ms then shows the demo error. Never calls any API. */
export function MockSubmit({
  children,
  submitLabel,
  testId,
  large = false,
}: {
  children?: ReactNode;
  submitLabel: ReactNode;
  testId: string;
  large?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setFailed(false);
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setFailed(true);
    }, 900);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {children}
      {failed ? <MockError /> : null}
      <button
        type="submit"
        data-testid={testId}
        disabled={loading}
        className={`btn-primary inline-flex w-full items-center justify-center gap-2 font-black disabled:cursor-wait disabled:opacity-70 ${
          large ? 'h-13 rounded-2xl px-6 py-4 text-base' : 'h-11 rounded-full px-6 text-sm'
        }`}
      >
        {loading ? (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : null}
        {submitLabel}
      </button>
    </form>
  );
}

export function MockGradeChips({
  value,
  onChange,
  testPrefix,
}: {
  value: string;
  onChange: (id: string) => void;
  testPrefix: string;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-bold text-foreground">الصف الدراسي</span>
      <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="الصف الدراسي">
        {LAB_GRADES.map((grade) => {
          const active = value === grade.id;
          return (
            <button
              key={grade.id}
              type="button"
              data-testid={`${testPrefix}-grade-${grade.id}`}
              aria-pressed={active}
              onClick={() => onChange(grade.id)}
              className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong ${
                active
                  ? 'btn-primary border-transparent'
                  : 'border-border bg-input text-foreground-muted hover:border-primary/50 hover:text-foreground'
              }`}
            >
              {grade.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MockSteps({
  steps,
  current,
  testPrefix,
}: {
  steps: string[];
  current: number;
  testPrefix: string;
}) {
  return (
    <ol
      data-testid={`${testPrefix}-steps`}
      className="flex items-center gap-1.5"
      aria-label="خطوات التسجيل"
    >
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step} className="flex flex-1 items-center gap-1.5 last:flex-none">
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                done || active ? 'btn-primary' : 'border border-border bg-input text-foreground-subtle'
              }`}
            >
              {done ? '✓' : index + 1}
            </span>
            <span
              className={`hidden text-xs font-bold sm:block ${
                active ? 'text-foreground' : 'text-foreground-subtle'
              }`}
            >
              {step}
            </span>
            {index < steps.length - 1 ? (
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
