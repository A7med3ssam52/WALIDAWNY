import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  makeNotification,
  makeUnitPurchase,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('StudentDashboardPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedStudent({ full_name: 'أحمد محمد' });
  });

  it('shows a greeting and the profile summary', async () => {
    renderApp('/student/dashboard');

    expect(await screen.findByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
    expect(screen.getByText(/مرحبًا، أحمد محمد/)).toBeInTheDocument();
    expect(screen.getByText('student@example.com')).toBeInTheDocument();
    expect(screen.getByText('01001234567')).toBeInTheDocument();
  });

  it('builds the WhatsApp contact link from the public settings', async () => {
    renderApp('/student/dashboard');

    const link = await screen.findByRole('link', { name: 'فتح محادثة واتساب' });
    expect(link).toHaveAttribute('href', expect.stringContaining('wa.me/201000000000'));
    expect(link).toHaveAttribute('href', expect.stringContaining('text='));
  });

  it('shows the purchased units card with the count and total', async () => {
    mockState.unitPurchases.push(
      makeUnitPurchase({ id: 'purchase-1', unit_id: 'unit-1', total_price: 350 }),
      makeUnitPurchase({ id: 'purchase-2', unit_id: 'unit-2', total_price: 200 }),
    );
    renderApp('/student/dashboard');

    expect(await screen.findByText('عدد الوحدات المشتراة: 2')).toBeInTheDocument();
    expect(screen.getByText('إجمالي المدفوع: 550 ج.م')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'عرض الوحدات' })).toHaveAttribute(
      'href',
      '/student/units',
    );
  });

  it('shows the empty state when the student has no purchases', async () => {
    renderApp('/student/dashboard');

    expect(await screen.findByText('لم تشترِ أي وحدة بعد')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'عرض الوحدات' })).toHaveAttribute(
      'href',
      '/student/units',
    );
  });

  it('links to the curriculum and notifications pages', async () => {
    renderApp('/student/dashboard');

    expect(await screen.findByRole('link', { name: 'المنهج الدراسي' })).toHaveAttribute(
      'href',
      '/student/curriculum',
    );
    expect(screen.getByTestId('notifications-link')).toHaveAttribute(
      'href',
      '/student/notifications',
    );
  });

  it('shows the unread notifications badge with the count', async () => {
    mockState.notifications.push(
      makeNotification({ id: 'notif-1', is_read: false }),
      makeNotification({ id: 'notif-2', is_read: true }),
      makeNotification({ id: 'notif-3', is_read: false }),
    );
    renderApp('/student/dashboard');

    expect(await screen.findByTestId('unread-count')).toHaveTextContent('2');
  });

  it('hides the unread badge when all notifications are read', async () => {
    mockState.notifications.push(makeNotification({ id: 'notif-1', is_read: true }));
    renderApp('/student/dashboard');

    expect(await screen.findByTestId('notifications-link')).toBeInTheDocument();
    expect(screen.queryByTestId('unread-count')).not.toBeInTheDocument();
  });
});
