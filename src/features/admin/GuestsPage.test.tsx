import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectRpcCall,
  getRpcCalls,
  makeProfile,
  mockState,
  resetMockState,
  setAuthenticatedAdmin,
  setAuthenticatedWalid,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('GuestsPage (guest mode)', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedAdmin();
    mockState.profiles.push(
      makeProfile({ id: 'g1', full_name: 'ضيف واحد', phone: '01001111111', is_guest: true }),
      makeProfile({
        id: 'g2',
        full_name: 'ضيف اثنان',
        phone: '01002222222',
        is_guest: true,
        status: 'disabled',
      }),
      makeProfile({ id: 's1', full_name: 'طالب عادي', phone: '01003333333' }),
    );
  });

  it('lists only guests with stats for admin', async () => {
    renderApp('/admin/guests');

    expect(await screen.findByText('ضيف واحد')).toBeInTheDocument();
    expect(screen.getByText('ضيف اثنان')).toBeInTheDocument();
    expect(screen.queryByText('طالب عادي')).not.toBeInTheDocument();
    expect(screen.getByTestId('guest-row-g1')).toBeInTheDocument();
    expect(screen.getByTestId('guest-row-g2')).toBeInTheDocument();
    // stats from the mock state: 2 guests, 1 active
    expect(screen.getByText('إجمالي الضيوف')).toBeInTheDocument();
  });

  it('converts a normal student to guest from the search box', async () => {
    const user = userEvent.setup();
    renderApp('/admin/guests');

    await screen.findByText('ضيف واحد');
    await user.type(screen.getByLabelText('بحث عن طالب'), 'طالب عادي');

    expect(await screen.findByText('طالب عادي')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تحويل لضيف' }));

    await waitFor(() => {
      expect(expectRpcCall('set_guest_status')).toEqual({ p_student_id: 's1', p_is_guest: true });
    });
    // converted student now appears in the guest list
    await waitFor(() => {
      expect(getRpcCalls().filter((call) => call.fn === 'list_guests').length).toBeGreaterThan(1);
    });
  });

  it('revokes guest mode from the guest card', async () => {
    const user = userEvent.setup();
    renderApp('/admin/guests');

    const card = await screen.findByTestId('guest-row-g1');
    await user.click(within(card).getByRole('button', { name: 'إلغاء الضيف' }));

    await waitFor(() => {
      expect(expectRpcCall('set_guest_status')).toEqual({ p_student_id: 'g1', p_is_guest: false });
    });
  });

  it('redirects non-admin staff away from the guests page', async () => {
    resetMockState();
    setAuthenticatedWalid();
    mockState.profiles.push(
      makeProfile({ id: 'g1', full_name: 'ضيف واحد', phone: '01001111111', is_guest: true }),
    );
    renderApp('/admin/guests');

    await waitFor(() => {
      expect(screen.queryByText('وضع الضيف')).not.toBeInTheDocument();
    });
    expect(getRpcCalls().filter((call) => call.fn === 'list_guests')).toHaveLength(0);
  });
});
