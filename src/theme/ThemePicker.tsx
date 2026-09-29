import { useEffect, useRef, useState } from 'react';
import { Palette } from 'lucide-react';

import { THEME_PALETTES } from './palettes';
import { useTheme } from './ThemeContext';

/**
 * Theme picker — rendered in the LayoutShell header.
 * Choosing a palette applies it immediately and persists it to localStorage
 * (via ThemeContext) so it survives reloads on the same device.
 */
export function ThemePicker() {
  const { themeId, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open ]);

  const choose = (id: string) => {
    setTheme(id);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="theme-picker-button"
        onClick={() => setOpen((v) => !v)}
        aria-label="اختيار اللون"
        aria-expanded={open}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-muted text-foreground-muted"
      >
        <Palette aria-hidden="true" className="h-5 w-5" />
      </button>
      {open ? (
        <div
          ref={panelRef}
          data-testid="theme-picker-panel"
          role="dialog"
          aria-label="ألوان المنصة"
          className="absolute end-0 top-12 z-50 w-56 rounded-2xl border border-border bg-surface p-2 shadow-elevated"
        >
          {THEME_PALETTES.map((palette) => (
            <button
              key={palette.id}
              type="button"
              data-testid={`theme-option-${palette.id}`}
              aria-pressed={themeId === palette.id}
              onClick={() => choose(palette.id)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-muted"
            >
              <span
                aria-hidden="true"
                className="h-5 w-5 rounded-full border border-border"
                style={{ backgroundColor: palette.swatch }}
              />
              {palette.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default ThemePicker;
