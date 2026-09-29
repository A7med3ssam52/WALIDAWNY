import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getRpcCalls,
  makeNotification,
  makeProfile,
  mockState,
  resetMockState,
  setAuthenticatedAdmin,
  setAuthenticatedTeacher,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

function seed() {
  mockState.profiles.push(
    makeProfile({
      id: 'student-1',
      full_name: 'طالب واحد',
      phone: '01001112222',
      avatar_path: 'student-1/avatar.jpg',
    }),
  );
  mockState.notifications.push(
    makeNotification({
      id: 'notif-av-1',
      user_id: 'user-admin-1',
      type: 'avatar_updated',
      title: 'تحديث الصورة الشخصية',
      body: 'طالب واحد',
      dedup_key: 'avatar_updated:student-1:1',
      entity_type: 'profiles',
      entity_id: 'student-1',
      is_read: false,
    }),
    makeNotification({
      id: 'notif-other-1',
      user_id: 'user-admin-1',
      type: 'system',
      title: 'صيانة',
      body: 'x',
      is_read: false,
    }),
  );
}

describe('AdminNotificationsPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedAdmin();
    seed();
  });

  it('lists avatar updates with the student preview and detail link', async () => {
    renderApp('/admin/notifications');

    const row = await screen.findByTestId('admin-notification-notif-av-1');
    expect(within(row).getByText(/طالب واحد/)).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'عرض طالب واحد' })).toHaveAttribute(
      'href',
      '/walid/students/student-1',
    );
    // Other notification types are filtered out of this inbox.
    expect(screen.queryByTestId('admin-notification-notif-other-1')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no avatar updates', async () => {
    mockState.notifications = mockState.notifications.filter((row) => row.type !== 'avatar_updated');
    renderApp('/admin/notifications');

    expect(await screen.findByText('لا توجد إشعارات صور بعد')).toBeInTheDocument();
  });

  it('marks all as read from the header action', async () => {
    const user = userEvent.setup();
    renderApp('/admin/notifications');

    await screen.findByTestId('admin-notification-notif-av-1');
    await user.click(screen.getByRole('button', { name: 'تعليم الكل كمقروء' }));

    await waitFor(() => {
      expect(getRpcCalls().some((call) => call.fn === 'mark_all_notifications_read')).toBe(true);
    });
    expect(await screen.findByText('تم تعليم كل الإشعارات كمقروءة')).toBeInTheDocument();
  });

  it('blocks non-admin staff from the inbox', async () => {
    resetMockState();
    setAuthenticatedTeacher();
    seed();
    renderApp('/admin/notifications');

    expect(screen.queryByTestId('admin-notification-notif-av-1')).not.toBeInTheDocument();
    // RoleGuard bounces teachers to their home.
    expect(await screen.findByRole('heading', { name: 'لوحة المعلومات' })).toBeInTheDocument();
  });
});
