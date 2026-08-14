import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getRpcCalls,
  mockState,
  resetMockState,
  setAuthenticatedWalid,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('RolesPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedWalid({
      role: 'admin',
      id: 'user-admin-1',
      email: 'admin@example.com',
      full_name: 'المشرف العام',
    });
    mockState.profiles.push(
      {
        id: 'user-walid-1',
        full_name: 'الأستاذ وليد',
        phone: '+201001000001',
        guardian_phone: '+201001000001',
        address: 'Cairo',
        grade_id: null,
        role: 'mr_walid',
        status: 'active',
        deleted_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'user-student-1',
        full_name: 'طالب عادي',
        phone: '+201001000003',
        guardian_phone: '+201001000003',
        address: 'Cairo',
        grade_id: null,
        role: 'student',
        status: 'active',
        deleted_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    );
  });

  it('lists the staff members only (students excluded)', async () => {
    renderApp('/admin/roles');

    expect(await screen.findByRole('heading', { name: 'الأدوار والصلاحيات' })).toBeInTheDocument();
    const walidRow = await screen.findByTestId('role-row-user-walid-1');
    expect(within(walidRow).getByTestId('role-badge-mr_walid')).toBeInTheDocument();
    expect(screen.getByTestId('role-row-user-admin-1')).toBeInTheDocument();
    expect(screen.queryByTestId('role-row-user-student-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('role-badge-admin')).toBeInTheDocument();
  });

  it('does not allow changing your own role', async () => {
    renderApp('/admin/roles');

    const ownRow = await screen.findByTestId('role-row-user-admin-1');
    const select = ownRow.querySelector('select');
    expect(select).toBeDisabled();
    expect(within(ownRow).getByText('لا يمكنك تغيير دورك بنفسك')).toBeInTheDocument();
  });

  it('promotes a mr_walid user to admin through the confirm modal', async () => {
    const user = userEvent.setup();
    renderApp('/admin/roles');

    const walidRow = await screen.findByTestId('role-row-user-walid-1');
    const select = walidRow.querySelector('select')!;
    await user.selectOptions(select, 'admin');

    expect(screen.getByRole('heading', { name: 'تغيير الدور' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'نعم، تغيير' }));

    await waitFor(() => {
      expect(
        getRpcCalls().some(
          (call) =>
            call.fn === 'set_user_role' &&
            call.args?.p_user_id === 'user-walid-1' &&
            call.args?.p_role === 'admin',
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      const refreshed = screen.getByTestId('role-row-user-walid-1');
      expect(within(refreshed).getByTestId('role-badge-admin')).toBeInTheDocument();
    });
  });

  it('shows the toast when a role change succeeds', async () => {
    const user = userEvent.setup();
    renderApp('/admin/roles');

    const walidRow = await screen.findByTestId('role-row-user-walid-1');
    await user.selectOptions(walidRow.querySelector('select')!, 'student');
    await user.click(screen.getByRole('button', { name: 'نعم، تغيير' }));

    expect(await screen.findByText('تم تحديث دور الأستاذ وليد')).toBeInTheDocument();
  });

  it('shows an error state with retry when the user list fails to load', async () => {
    mockState.queryErrors.profiles = 'connection failed';
    const user = userEvent.setup();
    renderApp('/admin/roles');

    expect(await screen.findByText('تعذر تحميل المستخدمين')).toBeInTheDocument();

    mockState.queryErrors.profiles = '';
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    expect(await screen.findByTestId('role-row-user-walid-1')).toBeInTheDocument();
  });
});
