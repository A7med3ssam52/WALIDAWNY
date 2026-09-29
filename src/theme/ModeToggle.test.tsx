import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ModeToggle } from './ModeToggle';
import { THEME_MODE_STORAGE_KEY, ThemeProvider } from './ThemeContext';

function renderToggle() {
  return render(
    <ThemeProvider>
      <ModeToggle />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-mode');
});

describe('ModeToggle', () => {
  it('starts in light mode — Health Clean is light-only', () => {
    renderToggle();
    const button = screen.getByTestId('mode-toggle');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
  });

  it('stays in light mode when toggled and persists the choice', () => {
    renderToggle();
    const button = screen.getByTestId('mode-toggle');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
    expect(window.localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe('light');
  });

  it('ignores a saved dark mode and boots in light', () => {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, 'dark');
    renderToggle();
    expect(screen.getByTestId('mode-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
  });
});
