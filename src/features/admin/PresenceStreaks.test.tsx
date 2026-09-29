import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  mockRpc,
  resetMockState,
  setAuthenticatedAdmin,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

const ROWS = [
  {
    student_id: 'student-1',
    full_name: 'أحمد محمد',
    grade_name: 'الصف الأول',
    current_days: 12,
    last_active_date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
    freeze_used_this_week: false,
    voucher_status: 'granted',
  },
  {
    student_id: 'student-2',
    full_name: 'مريم علي',
    grade_name: 'الصف الأول',
    current_days: 0,
    last_active_date: new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10),
    freeze_used_this_week: true,
    voucher_status: 'none',
  },
];

describe('PresencePage streaks tab', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedAdmin();
    mockRpc('list_student_streaks', ROWS);
  });

  it('renders the streak board sorted by current days', async () => {
    renderApp('/admin/presence');
    fireEvent.click(await screen.findByTestId('presence-tab-streaks', {}, { timeout: 5000 }));

    expect(await screen.findByTestId('streak-row-student-1', {}, { timeout: 5000 })).toBeInTheDocument();
    const row = screen.getByTestId('streak-row-student-1');
    expect(within(row).getByText('أحمد محمد')).toBeInTheDocument();
    expect(within(row).getByText('12')).toBeInTheDocument();
    expect(within(row).getByText('سارية')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'السجل' })).toHaveAttribute(
      'href',
      '/admin/presence/student-1',
    );
  });

  it('filters stopped streaks and voucher holders', async () => {
    renderApp('/admin/presence');
    fireEvent.click(await screen.findByTestId('presence-tab-streaks', {}, { timeout: 5000 }));
    await screen.findByTestId('streak-row-student-1', {}, { timeout: 5000 });

    fireEvent.change(screen.getByTestId('streak-filter'), { target: { value: 'stopped' } });
    expect(screen.queryByTestId('streak-row-student-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('streak-row-student-2')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('streak-filter'), { target: { value: 'voucher' } });
    expect(screen.getByTestId('streak-row-student-1')).toBeInTheDocument();
    expect(screen.queryByTestId('streak-row-student-2')).not.toBeInTheDocument();
  });
});
