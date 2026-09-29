import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_THEME_ID, THEME_STORAGE_KEY } from './palettes';
import { THEME_MODE_STORAGE_KEY, ThemeProvider, useTheme } from './ThemeContext';

function Probe() {
  const { themeId, setTheme, resetTheme, mode, toggleMode } = useTheme();
  return (
    <div>
      <span data-testid="theme-id">{themeId}</span>
      <span data-testid="theme-mode">{mode}</span>
      <button type="button" onClick={() => setTheme('midnight')}>
        to-midnight
      </button>
      <button type="button" onClick={() => setTheme('nope')}>
        to-invalid
      </button>
      <button type="button" onClick={resetTheme}>
        reset
      </button>
      <button type="button" onClick={toggleMode}>
        toggle-mode
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeProvider', () => {
  it('defaults to midnight and applies it to the document', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(DEFAULT_THEME_ID).toBe('midnight');
    expect(screen.getByTestId('theme-id')).toHaveTextContent(DEFAULT_THEME_ID);
    expect(document.documentElement.getAttribute('data-theme')).toBe(DEFAULT_THEME_ID);
  });

  it('restores the saved theme from localStorage on boot', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'midnight');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme-id')).toHaveTextContent('midnight');
    expect(document.documentElement.getAttribute('data-theme')).toBe('midnight');
  });

  it('ignores invalid stored values', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'hacker";x');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme-id')).toHaveTextContent(DEFAULT_THEME_ID);
  });

  it('persists theme changes and rejects unknown ids', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByText('to-midnight'));
    expect(screen.getByTestId('theme-id')).toHaveTextContent('midnight');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('midnight');
    expect(document.documentElement.getAttribute('data-theme')).toBe('midnight');

    fireEvent.click(screen.getByText('to-invalid'));
    expect(screen.getByTestId('theme-id')).toHaveTextContent('midnight');

    fireEvent.click(screen.getByText('reset'));
    expect(screen.getByTestId('theme-id')).toHaveTextContent(DEFAULT_THEME_ID);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(DEFAULT_THEME_ID);
  });

  it('stays in light mode — Health Clean is light-only', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme-mode')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
    fireEvent.click(screen.getByText('toggle-mode'));
    expect(screen.getByTestId('theme-mode')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
    expect(window.localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe('light');
  });
});
