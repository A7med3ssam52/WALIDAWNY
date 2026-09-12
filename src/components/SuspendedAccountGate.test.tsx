import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetMockState, setAuthenticatedStudent } from '../test/supabase-mock';
import { renderApp } from '../test/utils';

describe('SuspendedAccountGate', () => {
  beforeEach(() => {
    resetMockState();
  });

  it('locks a suspended student behind the non-dismissable shield block', async () => {
    setAuthenticatedStudent({
      full_name: 'طالب موقوف',
      status: 'disabled',
      suspension_reason: 'مشاركة الحساب مع أكثر من جهاز',
    });
    renderApp('/student/dashboard');

    const block = await screen.findByTestId('suspended-account-block');
    expect(block).toBeInTheDocument();
    expect(block).toHaveTextContent('تم إيقاف حسابك');
    expect(block).toHaveTextContent('مشاركة الحساب مع أكثر من جهاز');
    expect(block).toHaveTextContent('طالب موقوف');
    expect(block).toHaveTextContent('لا يمكن إغلاق هذه النافذة');

    const cta = screen.getByRole('link', { name: 'تواصل عبر واتساب' });
    expect(cta).toHaveAttribute('href', expect.stringContaining('wa.me/201226771154'));
    expect(cta.getAttribute('href')).toContain(encodeURIComponent('طالب موقوف'));

    expect(screen.queryByRole('heading', { name: 'لوحة الطالب' })).not.toBeInTheDocument();
  });

  it('shows the default message when an old suspension has no reason', async () => {
    setAuthenticatedStudent({
      full_name: 'طالب قديم',
      status: 'disabled',
      suspension_reason: null,
    });
    renderApp('/student/dashboard');

    const block = await screen.findByTestId('suspended-account-block');
    expect(block).toHaveTextContent('بقرار إداري');
  });

  it('lets an active student through to the dashboard', async () => {
    setAuthenticatedStudent({ full_name: 'أحمد محمد' });
    renderApp('/student/dashboard');

    expect(
      await screen.findByRole('heading', { name: 'لوحة الطالب' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('suspended-account-block')).not.toBeInTheDocument();
  });
});
