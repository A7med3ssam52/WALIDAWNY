import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetMockState, setAuthenticatedStudent } from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('NotFoundPage', () => {
  beforeEach(() => {
    resetMockState();
  });

  it('shows a 404 page for unknown routes', async () => {
    renderApp('/does-not-exist');

    expect(await screen.findByRole('heading', { name: '404' })).toBeInTheDocument();
    expect(screen.getByText('الصفحة التي تبحث عنها غير موجودة')).toBeInTheDocument();
  });

  it('shows the 404 page instead of redirecting authenticated users', async () => {
    setAuthenticatedStudent();
    renderApp('/student/unknown-route');

    expect(await screen.findByRole('heading', { name: '404' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'العودة إلى الرئيسية' })).toBeInTheDocument();
  });
});
