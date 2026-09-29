import { describe, expect, it } from 'vitest';

import {
  DEFAULT_THEME_ID,
  THEME_PALETTES,
  THEME_STORAGE_KEY,
  getPalette,
  isValidThemeId,
} from './palettes';

const HEX = /^#[0-9a-f]{6}$/i;

describe('theme palettes', () => {
  it('has a non-empty storage key and midnight as the default theme', () => {
    expect(THEME_STORAGE_KEY).toBe('walidawny-theme-v2');
    expect(DEFAULT_THEME_ID).toBe('midnight');
    expect(isValidThemeId(DEFAULT_THEME_ID)).toBe(true);
  });

  it('defines palettes with unique ids', () => {
    expect(THEME_PALETTES.length).toBeGreaterThanOrEqual(1);
    const ids = THEME_PALETTES.map((palette) => palette.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('health');
  });

  it('gives every palette the health tokens (valid hex + soft rgba)', () => {
    for (const palette of THEME_PALETTES) {
      expect(palette.name.trim().length).toBeGreaterThan(0);
      for (const key of [
        'primary',
        'primaryStrong',
        'accent',
        'accentStrong',
        'glow',
        'swatch',
      ] as const) {
        expect(palette[key], `${palette.id}.${key}`).toMatch(HEX);
      }
      expect(palette.primarySoft, `${palette.id}.primarySoft`).toMatch(/^rgba\(/);
      expect(palette.accentSoft, `${palette.id}.accentSoft`).toMatch(/^rgba\(/);
    }
  });

  it('resolves the health tokens for the default palette', () => {
    const health = getPalette('health');
    expect(health.primary).toBe('#93b884');
    expect(health.primaryStrong).toBe('#aacf9b');
    expect(health.accent).toBe('#a8a3cf');
    expect(health.glow).toBe('#a9c795');
    expect(health.swatch).toBe('#93b884');
    expect(health.mode).toBe('dark');
  });

  it('defines 6 comfort palettes: 3 light + 3 dark with distinct swatches', () => {
    expect(THEME_PALETTES.map((p) => p.id)).toEqual([
      'health',
      'midnight',
      'paper',
      'sage',
      'sky',
      'cocoa',
    ]);
    expect(THEME_PALETTES.filter((p) => p.mode === 'light').map((p) => p.id)).toEqual([
      'paper',
      'sage',
      'sky',
    ]);
    expect(THEME_PALETTES.filter((p) => p.mode === 'dark').map((p) => p.id)).toEqual([
      'health',
      'midnight',
      'cocoa',
    ]);
    const swatches = THEME_PALETTES.map((p) => p.swatch.toLowerCase());
    expect(new Set(swatches).size).toBe(swatches.length);
    for (const palette of THEME_PALETTES) {
      expect(palette.background).toMatch(HEX);
    }
  });

  it('resolves known ids and falls back to default for unknown ones', () => {
    expect(getPalette('midnight').id).toBe('midnight');
    expect(getPalette('paper').id).toBe('paper');
    expect(getPalette('nope').id).toBe(DEFAULT_THEME_ID);
    expect(getPalette(null).id).toBe(DEFAULT_THEME_ID);
    expect(isValidThemeId('midnight')).toBe(true);
    expect(isValidThemeId('emerald')).toBe(false);
    expect(isValidThemeId('nope')).toBe(false);
    expect(isValidThemeId(null)).toBe(false);
  });
});
