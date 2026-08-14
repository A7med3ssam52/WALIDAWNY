import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectAuthCall,
  getAuthCalls,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderApp, renderWithProviders } from '../../test/utils';
import { StudentChangePasswordPage } from './StudentChangePasswordPage';

describe('StudentChangePasswordPage', () => {
  beforeEach(() => {
    resetMockState();
  });

  it('validates the new password length and the confirmation match', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudentChangePasswordPage />, '/student/password');

    await user.type(screen.getByLabelText('كلمة المرور الجديدة'), '123');
    await user.type(screen.getByLabelText('تأكيد كلمة المرور الجديدة'), '456');
    await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

    expect(screen.getByText('كلمة المرور يجب أن تكون 6 أحرف على الأقل')).toBeInTheDocument();
    expect(screen.getByText('تأكيد كلمة المرور غير مطابق')).toBeInTheDocument();
    expect(getAuthCalls()).toHaveLength(0);
  });

  it('changes the password and shows a success toast', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudentChangePasswordPage />, '/student/password');

    await user.type(screen.getByLabelText('كلمة المرور الجديدة'), 'newpass1');
    await user.type(screen.getByLabelText('تأكيد كلمة المرور الجديدة'), 'newpass1');
    await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

    await waitFor(() => {
      expect(expectAuthCall('updateUser')).toEqual({ password: 'newpass1' });
    });
    expect(await screen.findByText('تم تغيير كلمة المرور بنجاح')).toBeInTheDocument();
  });

  it('signs out and redirects to login when the session must be re-authenticated', async () => {
    setAuthenticatedStudent();
    mockState.updateUserError =
      'Auth session missing! Session is expired, or the user must be re-authenticated before updating their password';
    const user = userEvent.setup();
    renderApp('/student/password');

    await user.type(await screen.findByLabelText('كلمة المرور الجديدة'), 'newpass1');
    await user.type(screen.getByLabelText('تأكيد كلمة المرور الجديدة'), 'newpass1');
    await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

    expect(await screen.findByRole('button', { name: 'تسجيل الدخول' })).toBeInTheDocument();
    await waitFor(() => {
      expect(getAuthCalls().some((call) => call.method === 'signOut')).toBe(true);
    });
    expect(
      await screen.findByText(
        'انتهت صلاحية الجلسة — يرجى تسجيل الدخول مرة أخرى لتغيير كلمة المرور',
      ),
    ).toBeInTheDocument();
  });

  it('shows an error toast for unexpected failures', async () => {
    mockState.updateUserError = 'network error';
    const user = userEvent.setup();
    renderWithProviders(<StudentChangePasswordPage />, '/student/password');

    await user.type(screen.getByLabelText('كلمة المرور الجديدة'), 'newpass1');
    await user.type(screen.getByLabelText('تأكيد كلمة المرور الجديدة'), 'newpass1');
    await user.click(screen.getByRole('button', { name: 'تغيير كلمة المرور' }));

    expect(
      await screen.findByText('تعذر تغيير كلمة المرور. حاول مرة أخرى لاحقًا'),
    ).toBeInTheDocument();
  });
});
