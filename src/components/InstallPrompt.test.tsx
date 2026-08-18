import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PWA_STORAGE_KEYS } from '../lib/pwa';
import { InstallPrompt } from './InstallPrompt';

const originalMatchMedia = window.matchMedia;
const originalUserAgent = navigator.userAgent;

function stubMatchMedia(matches: boolean) {
  const mql = {
    matches,
    media: '(display-mode: standalone)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
}

function createBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = new Event('beforeinstallprompt');
  Object.defineProperty(event, 'prompt', { value: prompt });
  Object.defineProperty(event, 'userChoice', {
    value: Promise.resolve({ outcome, platform: 'web' }),
  });
  return { event, prompt };
}

describe('InstallPrompt', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders nothing until an install signal arrives', () => {
    render(<InstallPrompt />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the custom install sheet with the platform title when beforeinstallprompt fires', () => {
    const { event } = createBeforeInstallPrompt();
    render(<InstallPrompt />);

    act(() => {
      window.dispatchEvent(event);
    });

    expect(
      screen.getByRole('heading', { name: 'ثبّت تطبيق منصة وليد عونى على موبايلك' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تثبيت التطبيق الآن' })).toBeInTheDocument();
  });

  it('calls the deferred prompt and hides after the user accepts', async () => {
    const { event, prompt } = createBeforeInstallPrompt('accepted');
    render(<InstallPrompt />);

    act(() => {
      window.dispatchEvent(event);
    });

    fireEvent.click(screen.getByRole('button', { name: 'تثبيت التطبيق الآن' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(PWA_STORAGE_KEYS.installed)).toBe('1');
  });

  it('dismisses on «لاحقاً» and does not re-open within the cooldown window', () => {
    const first = createBeforeInstallPrompt('accepted');
    const { unmount } = render(<InstallPrompt />);

    act(() => {
      window.dispatchEvent(first.event);
    });
    fireEvent.click(screen.getByRole('button', { name: 'لاحقاً' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(PWA_STORAGE_KEYS.dismissed)).not.toBeNull();

    const second = createBeforeInstallPrompt('accepted');
    unmount();
    render(<InstallPrompt />);
    act(() => {
      window.dispatchEvent(second.event);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the iOS guide for Safari users and hides on «فهمت»', () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari',
      configurable: true,
    });

    render(<InstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(
      screen.getByRole('heading', { name: 'أضف منصة وليد عونى إلى شاشتك الرئيسية' }),
    ).toBeInTheDocument();
    expect(screen.getByText('اختر «إضافة إلى الشاشة الرئيسية»')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'فهمت، سأثبّته الآن' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('never shows the prompt when already running as an installed app', () => {
    stubMatchMedia(true);
    const { event } = createBeforeInstallPrompt();
    render(<InstallPrompt />);

    act(() => {
      window.dispatchEvent(event);
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(PWA_STORAGE_KEYS.installed)).toBe('1');
  });
});
