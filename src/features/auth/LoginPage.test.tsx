import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { mockState, resetMockState, setAuthenticatedStudent } from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('LoginPage', () => {
  beforeEach(() => {
    resetMockState();
  });

  const fillValidForm = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByLabelText('البريد الإلكتروني');
    await user.type(screen.getByLabelText('البريد الإلكتروني'), 'student@example.com');
    await user.type(screen.getByLabelText('كلمة المرور'), 'secret123');
  };

  it('shows validation errors for an empty form', async () => {
    const user = userEvent.setup();
    renderApp('/login');

    const submitButton = await screen.findByRole('button', { name: 'تسجيل الدخول' });
    await user.click(submitButton);

    expect(screen.getByText('البريد الإلكتروني مطلوب')).toBeInTheDocument();
    expect(screen.getByText('كلمة المرور مطلوبة')).toBeInTheDocument();
  });

  it('shows an Arabic message for invalid credentials', async () => {
    mockState.signInError = 'Invalid login credentials';
    const user = userEvent.setup();
    renderApp('/login');

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    await waitFor(() => {
      const form = screen.getByLabelText('البريد الإلكتروني').closest('form');
      expect(within(form as HTMLElement).getByRole('alert')).toHaveTextContent(
        'بيانات الدخول غير صحيحة',
      );
    });
  });

  it('shows an Arabic message for an inactive or deleted account', async () => {
    mockState.signInError = 'account_inactive_or_deleted';
    const user = userEvent.setup();
    renderApp('/login');

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    await waitFor(() => {
      const form = screen.getByLabelText('البريد الإلكتروني').closest('form');
      expect(within(form as HTMLElement).getByRole('alert')).toHaveTextContent(
        'تم إيقاف هذا الحساب. يرجى التواصل مع إدارة المنصة',
      );
    });
  });

  it('navigates to the student dashboard after a successful login', async () => {
    const user = userEvent.setup();
    renderApp('/login');

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
    });
  });

  it('redirects an already-authenticated student away from the login page', async () => {
    setAuthenticatedStudent();
    renderApp('/login');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
    });
  });
});
