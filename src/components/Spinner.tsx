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
        className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500/25 border-t-indigo-300 shadow-[0_0_18px_-4px_rgba(99,102,241,0.6)]"
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}
