import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../test/supabase-mock'; // registers the @supabase/supabase-js mock

describe('App — VITE_MAINTENANCE_MODE', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('renders the security lockdown screen instead of the router when enabled', async () => {
    vi.stubEnv('VITE_MAINTENANCE_MODE', 'true');
    vi.resetModules();

    const { App } = await import('./App');
    render(<App />);

    expect(screen.getByRole('heading', { name: 'الإغلاق المؤقت للمنصة' })).toBeInTheDocument();
    // Router chrome (e.g. login links) must not leak through
    expect(screen.queryByRole('link', { name: /تسجيل الدخول/ })).not.toBeInTheDocument();
  });

  it('renders the normal app when the flag is not "true"', async () => {
    vi.stubEnv('VITE_MAINTENANCE_MODE', 'false');
    vi.resetModules();

    const { App } = await import('./App');
    render(<App />);

    expect(screen.queryByRole('heading', { name: 'الإغلاق المؤقت للمنصة' })).not.toBeInTheDocument();
  });
});
