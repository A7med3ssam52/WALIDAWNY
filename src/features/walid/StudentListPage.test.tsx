import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectQueryFilters,
  expectRpcCall,
  makeProfile,
  mockState,
  resetMockState,
  setAuthenticatedWalid,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('StudentListPage (staff lifecycle)', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedWalid();
    mockState.profiles.push(
      makeProfile({ id: 's1', full_name: 'طالب واحد', phone: '01001111111' }),
      makeProfile({ id: 's2', full_name: 'طالب اثنان', phone: '01002222222', status: 'disabled' }),
    );
  });

  it('lists students with their status badges', async () => {
    renderApp('/walid/students');

    expect(await screen.findByText('طالب واحد')).toBeInTheDocument();
    expect(screen.getByText('طالب اثنان')).toBeInTheDocument();
    expect(within(screen.getByTestId('student-row-s1')).getByText('نشط')).toBeInTheDocument();
    expect(within(screen.getByTestId('student-row-s2')).getByText('موقوف')).toBeInTheDocument();
    expect(expectQueryFilters('profiles')).toContainEqual({
      column: 'deleted_at',
      value: null,
      op: 'is',
    });
  });

  it('excludes soft-deleted students from the list', async () => {
    mockState.profiles.push(
      makeProfile({
        id: 's3',
        full_name: 'محذوف',
        phone: '01003333333',
        deleted_at: '2026-02-01T10:00:00.000Z',
      }),
    );
    renderApp('/walid/students');

    expect(await screen.findByText('طالب واحد')).toBeInTheDocument();
    expect(screen.queryByText('محذوف')).not.toBeInTheDocument();
  });

  it('disables a student after confirmation', async () => {
    const user = userEvent.setup();
    renderApp('/walid/students');

    const row = await screen.findByTestId('student-row-s1');
    await user.click(within(row).getByRole('button', { name: 'إيقاف' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'نعم، إيقاف' }));

    await waitFor(() => {
      expect(expectRpcCall('disable_student')).toEqual({ p_student_id: 's1' });
    });
    await waitFor(() => {
      expect(within(screen.getByTestId('student-row-s1')).getByText('موقوف')).toBeInTheDocument();
    });
  });

  it('enables a disabled student after confirmation', async () => {
    const user = userEvent.setup();
    renderApp('/walid/students');

    const row = await screen.findByTestId('student-row-s2');
    await user.click(within(row).getByRole('button', { name: 'تفعيل' }));
    await user.click(screen.getByRole('button', { name: 'نعم، تفعيل' }));

    await waitFor(() => {
      expect(expectRpcCall('enable_student')).toEqual({ p_student_id: 's2' });
    });
    await waitFor(() => {
      expect(within(screen.getByTestId('student-row-s2')).getByText('نشط')).toBeInTheDocument();
    });
  });

  it('soft-deletes a student after a danger confirmation', async () => {
    const user = userEvent.setup();
    renderApp('/walid/students');

    const row = await screen.findByTestId('student-row-s1');
    await user.click(within(row).getByRole('button', { name: 'حذف' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('سلة المحذوفات');
    await user.click(screen.getByRole('button', { name: 'نعم، حذف' }));

    await waitFor(() => {
      expect(expectRpcCall('soft_delete_student')).toEqual({ p_student_id: 's1' });
    });
    await waitFor(() => {
      expect(screen.queryByTestId('student-row-s1')).not.toBeInTheDocument();
    });
  });

  it('filters students by the search box', async () => {
    const user = userEvent.setup();
    renderApp('/walid/students');

    await screen.findByText('طالب واحد');
    await user.type(screen.getByLabelText('بحث'), 'اثنان');

    expect(screen.queryByText('طالب واحد')).not.toBeInTheDocument();
    expect(screen.getByText('طالب اثنان')).toBeInTheDocument();
  });

  it('shows an empty state when there are no students', async () => {
    mockState.profiles = [makeProfile({ id: 'user-walid-1', role: 'mr_walid' })];
    renderApp('/walid/students');

    expect(await screen.findByText('لا يوجد طلاب مسجلون بعد')).toBeInTheDocument();
  });

  it('shows an error state with a retry that recovers', async () => {
    mockState.queryErrors.profiles = 'connection failed';
    const user = userEvent.setup();
    renderApp('/walid/students');

    expect(await screen.findByText('تعذر تحميل قائمة الطلاب')).toBeInTheDocument();

    mockState.queryErrors.profiles = '';
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    expect(await screen.findByText('طالب واحد')).toBeInTheDocument();
  });
});
