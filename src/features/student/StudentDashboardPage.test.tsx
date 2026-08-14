import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  makeGrade,
  makeNotification,
  makePlan,
  makeSubscription,
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

  it('shows the active-subscription chip with the expiry date', async () => {
    mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
    mockState.pricingPlans.push(makePlan({ id: 'plan-1', grade_id: 'grade-1' }));
    mockState.subscriptions.push(
      makeSubscription({ expires_at: new Date(Date.now() + 10 * 86_400_000).toISOString() }),
    );
    renderApp('/student/dashboard');

    expect(await screen.findByText(/اشتراك نشط حتى/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'عرض التفاصيل' })).toHaveAttribute(
      'href',
      '/student/subscriptions',
    );
  });

  it('shows the activation link when there is no active subscription', async () => {
    renderApp('/student/dashboard');

    expect(await screen.findByRole('link', { name: 'تفعيل اشتراك' })).toHaveAttribute(
      'href',
      '/student/subscriptions',
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
