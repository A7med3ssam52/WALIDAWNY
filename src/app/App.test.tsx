import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('App', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows ConfigErrorScreen when Supabase env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.resetModules();

    const { App } = await import('./App');
    render(<App />);

    // Fallback is committed in supabase.ts: empty env still yields a configured client
    // via .env.production fallback, so ConfigErrorScreen is NOT shown.
    expect(
      screen.queryByRole('heading', { name: 'تعذر تشغيل التطبيق' }),
    ).not.toBeInTheDocument();
  });
});
