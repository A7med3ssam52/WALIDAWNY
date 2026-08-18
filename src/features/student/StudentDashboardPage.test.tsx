import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  makeGrade,
  makeNotification,
  makeUnit,
  makeUnitPricing,
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

    expect(await screen.findByText('الوحدات المشتراة')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('إجمالي المدفوع')).toBeInTheDocument();
    expect(screen.getByText('550 ج.م')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'عرض الكل' })).toHaveAttribute(
      'href',
      '/student/units',
    );
  });

  it('shows the empty state when the student has no purchases', async () => {
    renderApp('/student/dashboard');

    expect(await screen.findByText('لم تشترِ أي وحدة بعد')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تصفح الوحدات المتاحة' })).toHaveAttribute(
      'href',
      '/student/units',
    );
  });

  it('shows the grade units section with prices and actions', async () => {
    const profile = mockState.profiles.find((item) => item.id === 'user-test-1');
    if (profile) {
      profile.grade_id = 'grade-1';
    }
    mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
    mockState.units.push(
      makeUnit({ id: 'unit-1', grade_id: 'grade-1', name: 'الوحدة الأولى', status: 'published' }),
      makeUnit({ id: 'unit-2', grade_id: 'grade-1', name: 'الوحدة الثانية', status: 'published' }),
    );
    mockState.unitPricing.push(
      makeUnitPricing({ id: 'pricing-1', unit_id: 'unit-1' }),
      makeUnitPricing({
        id: 'pricing-2',
        unit_id: 'unit-2',
        base_price: 200,
        platform_fee: 50,
        total_price: 250,
      }),
    );
    mockState.unitPurchases.push(makeUnitPurchase({ id: 'purchase-1', unit_id: 'unit-1' }));
    renderApp('/student/dashboard');

    const section = await screen.findByTestId('grade-units-section');
    await within(section).findByText('وحدات صفك');
    expect(within(section).getByText('الوحدة الأولى')).toBeInTheDocument();
    expect(within(section).getByText('الوحدة الثانية')).toBeInTheDocument();
    expect(within(section).getByText('350 ج.م')).toBeInTheDocument();
    expect(within(section).getByText('250 ج.م')).toBeInTheDocument();
    expect(within(section).getByTestId('open-grade-unit-unit-1')).toHaveAttribute(
      'href',
      '/student/curriculum?unit=unit-1',
    );
    expect(within(section).getByRole('link', { name: 'تفعيل' })).toHaveAttribute(
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
