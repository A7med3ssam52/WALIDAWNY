import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('App', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the config error screen when Supabase env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.resetModules();

    const { App } = await import('./App');
    render(<App />);

    expect(screen.getByRole('heading', { name: 'تعذر تشغيل التطبيق' })).toBeInTheDocument();
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeInTheDocument();
    expect(screen.getByText('VITE_SUPABASE_PUBLISHABLE_KEY')).toBeInTheDocument();
  });
});
