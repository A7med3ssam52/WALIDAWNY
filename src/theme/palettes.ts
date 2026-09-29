/**
 * Comfort themes — 6 eye-friendly palettes (3 light + 3 dark).
 * All hues are desaturated and contrasts are kept low on purpose:
 * no pure black, no pure white text on light surfaces, no neon.
 *
 * Surface/text tokens live in themes.css (single source for CSS);
 * this module carries picker metadata + brand tokens + page background
 * (used for the <meta name="theme-color"> tag).
 */

export type ThemeMode = 'light' | 'dark';

export interface ThemePalette {
  id: string;
  /** Arabic display name */
  name: string;
  mode: ThemeMode;
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  glow: string;
  /** swatch dot color shown in the picker */
  swatch: string;
  /** page backdrop color — synced to <meta name="theme-color"> */
  background: string;
}

export const THEME_STORAGE_KEY = 'walidawny-theme-v2';
export const DEFAULT_THEME_ID = 'midnight';

export const THEME_PALETTES: ThemePalette[] = [
  {
    id: 'health',
    name: 'ليلي مريح',
    mode: 'dark',
    primary: '#93b884',
    primaryStrong: '#aacf9b',
    primarySoft: 'rgba(147, 184, 132, 0.14)',
    accent: '#a8a3cf',
    accentStrong: '#bdb7dc',
    accentSoft: 'rgba(168, 163, 207, 0.14)',
    glow: '#a9c795',
    swatch: '#93b884',
    background: '#141715',
  },
  {
    id: 'midnight',
    name: 'ليلي أزرق هادئ',
    mode: 'dark',
    primary: '#8fb4d6',
    primaryStrong: '#a9c8e2',
    primarySoft: 'rgba(143, 180, 214, 0.14)',
    accent: '#b3a8d6',
    accentStrong: '#c6bde4',
    accentSoft: 'rgba(179, 168, 214, 0.14)',
    glow: '#8fb4d6',
    swatch: '#8fb4d6',
    background: '#14171c',
  },
  {
    id: 'paper',
    name: 'ورقي دافئ',
    mode: 'light',
    primary: '#5f7a45',
    primaryStrong: '#4a6136',
    primarySoft: 'rgba(95, 122, 69, 0.12)',
    accent: '#6e6397',
    accentStrong: '#574d7c',
    accentSoft: 'rgba(110, 99, 151, 0.12)',
    glow: '#5f7a45',
    swatch: '#5f7a45',
    background: '#e7e2d5',
  },
  {
    id: 'sage',
    name: 'مريمي فاتح',
    mode: 'light',
    primary: '#4f7a52',
    primaryStrong: '#3e613f',
    primarySoft: 'rgba(79, 122, 82, 0.12)',
    accent: '#66719b',
    accentStrong: '#525b7e',
    accentSoft: 'rgba(102, 113, 155, 0.12)',
    glow: '#4f7a52',
    swatch: '#4f7a52',
    background: '#e2e7df',
  },
  {
    id: 'sky',
    name: 'رمادي مزرق فاتح',
    mode: 'light',
    primary: '#4a6fa5',
    primaryStrong: '#3a5a86',
    primarySoft: 'rgba(74, 111, 165, 0.12)',
    accent: '#4e7d7b',
    accentStrong: '#3d6462',
    accentSoft: 'rgba(78, 125, 123, 0.12)',
    glow: '#4a6fa5',
    swatch: '#4a6fa5',
    background: '#e4e7eb',
  },
  {
    id: 'cocoa',
    name: 'ليلي دافئ',
    mode: 'dark',
    primary: '#cfa96f',
    primaryStrong: '#e0be85',
    primarySoft: 'rgba(207, 169, 111, 0.14)',
    accent: '#be9c9c',
    accentStrong: '#d2b4b4',
    accentSoft: 'rgba(190, 156, 156, 0.14)',
    glow: '#cfa96f',
    swatch: '#cfa96f',
    background: '#171310',
  },
];

export function getPalette(id: string | null | undefined): ThemePalette {
  return (
    THEME_PALETTES.find((palette) => palette.id === id) ??
    THEME_PALETTES.find((palette) => palette.id === DEFAULT_THEME_ID) ??
    THEME_PALETTES[0]
  );
}

export function isValidThemeId(id: string | null | undefined): id is string {
  return THEME_PALETTES.some((palette) => palette.id === id);
}
