import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetMockState, setAuthenticatedWalid } from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('ExamsPage', () => {
  beforeEach(() => {
    resetMockState();
  });

  it('is locked with a coming-soon message for staff', async () => {
    setAuthenticatedWalid();
    renderApp('/walid/exams');

    expect(await screen.findByRole('heading', { name: 'الإختبارات' })).toBeInTheDocument();
    expect(screen.getByText('قريباً')).toBeInTheDocument();
    expect(screen.getByText('إدارة الإختبارات في الطريق إليك')).toBeInTheDocument();
  });

  it('appears as a nav item in the staff menu', async () => {
    setAuthenticatedWalid();
    renderApp('/walid/dashboard');

    expect(await screen.findByRole('link', { name: 'الإختبارات' })).toBeInTheDocument();
  });
});
