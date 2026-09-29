interface SpinnerProps {
  label?: string;
}

export function Spinner({ label = 'جاري التحميل' }: SpinnerProps) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-8 text-foreground-subtle"
    >
      <span
        aria-hidden="true"
        className="h-6 w-6 animate-spin rounded-full border-2 border-primary/25 border-t-primary-strong"
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}
