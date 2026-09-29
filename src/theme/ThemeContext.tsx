import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { DEFAULT_THEME_ID, THEME_PALETTES, THEME_STORAGE_KEY, getPalette, isValidThemeId } from './palettes';
import type { ThemePalette } from './palettes';

export type ThemeMode = 'light';

interface ThemeContextValue {
  themeId: string;
  palette: ThemePalette;
  setTheme: (id: string) => void;
  resetTheme: () => void;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const THEME_MODE_STORAGE_KEY = 'walidawny-mode-v2';
/** 5 comfort themes (3 light + 2 dark). data-mode is kept only for API
    compatibility — the real scheme comes from data-theme. */
const DEFAULT_MODE: ThemeMode = 'light';

function readStoredTheme(): string {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isValidThemeId(stored)) return stored;
  } catch {
    // private mode / SSR — fall through to default
  }
  return DEFAULT_THEME_ID;
}

function readStoredMode(): ThemeMode {
  return DEFAULT_MODE;
}

function applyTheme(id: string, mode: ThemeMode): void {
  try {
    document.documentElement.setAttribute('data-theme', id);
    document.documentElement.setAttribute('data-mode', mode);
    // Sync the browser chrome (address bar) with the page backdrop.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getPalette(id).background);
  } catch {
    // non-DOM environment — ignore
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<string>(() =>
    typeof window === 'undefined' ? DEFAULT_THEME_ID : readStoredTheme(),
  );
  const [mode, setModeState] = useState<ThemeMode>(() =>
    typeof window === 'undefined' ? DEFAULT_MODE : readStoredMode(),
  );

  useEffect(() => {
    applyTheme(themeId, mode);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
    } catch {
      // storage unavailable — theme still applies for this session
    }
  }, [themeId, mode]);

  const setTheme = useCallback((id: string) => {
    if (isValidThemeId(id)) setThemeId(id);
  }, []);

  const resetTheme = useCallback(() => setThemeId(DEFAULT_THEME_ID), []);

  const setMode = useCallback(() => setModeState('light'), []);
  const toggleMode = useCallback(() => setModeState('light'), []);

  const value = useMemo<ThemeContextValue>(
    () => ({ themeId, palette: getPalette(themeId), setTheme, resetTheme, mode, setMode, toggleMode }),
    [themeId, setTheme, resetTheme, mode, setMode, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

export { THEME_PALETTES, THEME_STORAGE_KEY, DEFAULT_THEME_ID };
