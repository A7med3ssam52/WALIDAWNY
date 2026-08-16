import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getRpcCalls,
  makeLesson,
  makeNotification,
  makeUnit,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('StudentNotificationsPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedStudent({ grade_id: 'grade-1' });
    mockState.notifications.push(
      makeNotification({ id: 'notif-1', title: 'درس جديد متاح', is_read: false }),
      makeNotification({
        id: 'notif-2',
        title: 'تم نشر محتوى جديد في صفك',
        type: 'system',
        is_read: true,
      }),
      makeNotification({
        id: 'notif-3',
        title: 'تم تفعيل وحدتك',
        type: 'unit_activated',
        is_read: false,
      }),
    );
  });

  it('lists the notifications with unread state and type labels', async () => {
    renderApp('/student/notifications');

    expect(await screen.findByRole('heading', { name: 'الإشعارات' })).toBeInTheDocument();
    expect(await screen.findByText(/لديك 2 إشعار غير مقروء/)).toBeInTheDocument();
    expect(screen.getByText('درس جديد متاح')).toBeInTheDocument();
    expect(screen.getByText('تم نشر محتوى جديد في صفك')).toBeInTheDocument();
    expect(screen.getByText('تم تفعيل وحدتك')).toBeInTheDocument();
    expect(screen.getByText('محتوى جديد')).toBeInTheDocument();
    expect(screen.getByText('النظام')).toBeInTheDocument();
    expect(screen.getByText('تفعيل وحدة')).toBeInTheDocument();
    const unread = screen.getByTestId('notification-notif-1');
    expect(unread).toHaveAttribute('data-unread', 'true');
    expect(screen.getByTestId('notification-notif-2')).toHaveAttribute('data-unread', 'false');
  });

  it('marks a single notification read on click', async () => {
    renderApp('/student/notifications');

    fireEvent.click(await screen.findByTestId('notification-notif-1'));

    await waitFor(() => {
      expect(getRpcCalls().some((call) => call.fn === 'mark_notification_read')).toBe(true);
      const call = getRpcCalls().find((entry) => entry.fn === 'mark_notification_read');
      expect(call?.args).toEqual({ p_notification_id: 'notif-1' });
    });
    expect(screen.getByTestId('notification-notif-1')).toHaveAttribute('data-unread', 'false');
    expect(screen.getByText(/لديك 1 إشعار غير مقروء/)).toBeInTheDocument();
  });

  it('marks all notifications read via the button', async () => {
    renderApp('/student/notifications');

    fireEvent.click(await screen.findByTestId('mark-all-read'));

    await waitFor(() => {
      expect(getRpcCalls().some((call) => call.fn === 'mark_all_notifications_read')).toBe(true);
    });
    expect(screen.getByText('لا توجد إشعارات غير مقروءة')).toBeInTheDocument();
    expect(screen.queryByTestId('mark-all-read')).not.toBeInTheDocument();
  });

  it('navigates to the lesson when a notification points to one', async () => {
    mockState.units.push(makeUnit({ id: 'unit-1', grade_id: 'grade-1', status: 'published' }));
    mockState.lessons.push(
      makeLesson({ id: 'lesson-1', unit_id: 'unit-1', title: 'الدرس الأول', status: 'published' }),
    );
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/student/notifications');

    fireEvent.click(await screen.findByTestId('notification-notif-1'));

    expect(await screen.findByRole('heading', { name: 'الدرس الأول' })).toBeInTheDocument();
  });

  it('shows the empty state when there are no notifications', async () => {
    mockState.notifications = [];
    renderApp('/student/notifications');

    expect(await screen.findByText('لا توجد إشعارات')).toBeInTheDocument();
  });
});
