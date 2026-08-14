import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectRpcCall,
  makeProfile,
  mockState,
  resetMockState,
  setAuthenticatedWalid,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('TrashPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedWalid();
    mockState.profiles.push(
      makeProfile({
        id: 's1',
        full_name: 'محذوف طالب',
        phone: '01001111111',
        deleted_at: '2026-02-01T10:00:00.000Z',
      }),
    );
  });

  it('lists soft-deleted students', async () => {
    renderApp('/walid/students/trash');

    expect(await screen.findByText('محذوف طالب')).toBeInTheDocument();
    expect(screen.getByText('01001111111')).toBeInTheDocument();
  });

  it('restores a student after confirmation and refreshes the list', async () => {
    const user = userEvent.setup();
    renderApp('/walid/students/trash');

    await screen.findByText('محذوف طالب');
    await user.click(screen.getByRole('button', { name: 'استعادة' }));
    await user.click(screen.getByRole('button', { name: 'نعم، استعادة' }));

    await waitFor(() => {
      expect(expectRpcCall('restore_student')).toEqual({ p_student_id: 's1' });
    });
    expect(await screen.findByText('سلة المحذوفات فارغة')).toBeInTheDocument();
  });

  it('shows an empty state when there is nothing to restore', async () => {
    mockState.profiles = [makeProfile({ id: 'user-walid-1', role: 'mr_walid' })];
    renderApp('/walid/students/trash');

    expect(await screen.findByText('سلة المحذوفات فارغة')).toBeInTheDocument();
  });
});
