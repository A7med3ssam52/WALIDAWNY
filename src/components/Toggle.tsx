import { useId } from 'react';

interface ToggleProps {
  label: string;
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}

export function Toggle({
  label,
  name,
  checked,
  onChange,
  disabled = false,
  hint,
}: ToggleProps) {
  const generatedId = useId();
  const inputId = `${generatedId}-toggle`;
  const hintId = hint ? `${inputId}-hint` : undefined;

  return (
    <label
      className={`flex items-center gap-3 select-none ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      htmlFor={inputId}
    >
      <input
        type="checkbox"
        id={inputId}
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        role="switch"
        aria-checked={checked}
        aria-describedby={hintId}
        className="sr-only peer"
      />
      <span
        aria-hidden="true"
        dir="ltr"
        className={[
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-all duration-200',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background',
          'peer-disabled:opacity-50 peer-disabled:cursor-not-allowed',
          checked
            ? 'bg-primary border-primary shadow-[0_0_14px_rgba(129,140,248,0.45)]'
            : 'bg-white/10 border-white/15',
        ].join(' ')}
      >
        <span
          className={[
            'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform duration-200',
            checked ? 'translate-x-6' : 'translate-x-1',
          ].join(' ')}
        />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint ? (
          <span id={hintId} className="text-xs leading-snug text-foreground-subtle">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}