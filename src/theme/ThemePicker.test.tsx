import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { THEME_PALETTES, THEME_STORAGE_KEY } from './palettes';
import { ThemeProvider } from './ThemeContext';
import { ThemePicker } from './ThemePicker';

function renderPicker() {
  return render(
    <ThemeProvider>
      <ThemePicker />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemePicker', () => {
  it('opens the panel listing every palette', () => {
    renderPicker();
    fireEvent.click(screen.getByTestId('theme-picker-button'));
    expect(screen.getByTestId('theme-picker-panel')).toBeInTheDocument();
    for (const palette of THEME_PALETTES) {
      expect(screen.getByTestId(`theme-option-${palette.id}`)).toBeInTheDocument();
    }
  });

  it('marks the active palette as pressed', () => {
    renderPicker();
    fireEvent.click(screen.getByTestId('theme-picker-button'));
    expect(screen.getByTestId('theme-option-midnight')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('theme-option-health')).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies and persists the chosen palette, then closes', () => {
    renderPicker();
    fireEvent.click(screen.getByTestId('theme-picker-button'));
    fireEvent.click(screen.getByTestId('theme-option-midnight'));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('midnight');
    expect(document.documentElement.getAttribute('data-theme')).toBe('midnight');
    expect(screen.queryByTestId('theme-picker-panel')).not.toBeInTheDocument();
  });

  it('closes the panel with Escape', () => {
    renderPicker();
    fireEvent.click(screen.getByTestId('theme-picker-button'));
    expect(screen.getByTestId('theme-picker-panel')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('theme-picker-panel')).not.toBeInTheDocument();
  });
});
