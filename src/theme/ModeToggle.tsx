import { Sun } from 'lucide-react';

import { useTheme } from './ThemeContext';

/**
 * Light-only mode toggle — Health Clean is fixed to light.
 * Renders a pressed, read-only button so existing tests/imports keep working.
 * Not rendered in LayoutShell anymore; kept for API compatibility.
 */
export function ModeToggle() {
  const { setMode } = useTheme();

  return (
    <button
      type="button"
      data-testid="mode-toggle"
      onClick={() => setMode('light')}
      aria-label="الوضع الفاتح"
      aria-pressed="true"
      title="الوضع الفاتح"
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-muted text-foreground-muted"
    >
      <Sun aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}

export default ModeToggle;
