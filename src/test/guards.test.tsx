import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  makeProfile,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
  setAuthenticatedTeacher,
  setAuthenticatedWalid,
} from './supabase-mock';
import { renderApp } from './utils';

describe('route guards', () => {
  beforeEach(() => {
    resetMockState();
  });

  it('redirects unauthenticated users to the login page', async () => {
    renderApp('/student/dashboard');

    expect(await screen.findByRole('heading', { name: 'تسجيل الدخول' })).toBeInTheDocument();
  });

  it('redirects a student away from staff routes', async () => {
    setAuthenticatedStudent();
    renderApp('/walid/students');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
    });
  });

  it('restores the session on reload and skips the guest pages', async () => {
    setAuthenticatedStudent();
    renderApp('/login');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
    });
  });

  it('redirects mr_walid away from student routes', async () => {
    setAuthenticatedWalid();
    renderApp('/student/dashboard');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'إدارة الطلاب' })).toBeInTheDocument();
    });
  });

  it('allows a teacher to access staff routes', async () => {
    setAuthenticatedTeacher();
    renderApp('/walid/students');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'إدارة الطلاب' })).toBeInTheDocument();
    });
  });

  it('allows an admin to access staff routes', async () => {
    setAuthenticatedWalid({ role: 'admin', id: 'user-admin-1', email: 'admin@example.com' });
    renderApp('/walid/students');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'إدارة الطلاب' })).toBeInTheDocument();
    });
  });

  it('shows a neutral loading state while the profile is being fetched, then renders', async () => {
    setAuthenticatedStudent();
    renderApp('/student/dashboard');

    expect(screen.getByText('جاري التحقق من الحساب')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
    });
    expect(screen.queryByText('تعذر تحميل بيانات الحساب')).not.toBeInTheDocument();
  });

  it('shows an error card with retry when the profile fetch fails, and recovers', async () => {
    setAuthenticatedStudent();
    mockState.singleQueryErrors.profiles = 'connection failed';
    const user = userEvent.setup();
    renderApp('/student/dashboard');

    expect(await screen.findByText('تعذر تحميل بيانات الحساب')).toBeInTheDocument();

    mockState.singleQueryErrors.profiles = '';
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
    });
  });

  it('offers a sign-out escape hatch from the profile error card', async () => {
    setAuthenticatedStudent();
    mockState.singleQueryErrors.profiles = 'connection failed';
    const user = userEvent.setup();
    renderApp('/student/dashboard');

    await screen.findByText('تعذر تحميل بيانات الحساب');
    await user.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'تسجيل الدخول' })).toBeInTheDocument();
    });
  });

  it('shows the profile error card instead of an infinite spinner when the profile row is missing', async () => {
    setAuthenticatedTeacher();
    mockState.profiles = [];
    const user = userEvent.setup();
    renderApp('/walid/students');

    expect(await screen.findByText('تعذر تحميل بيانات الحساب')).toBeInTheDocument();
    expect(screen.queryByText('جاري التحقق من الحساب')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'تسجيل الدخول' })).toBeInTheDocument();
    });
  });

  it('recovers from a missing profile via retry once the profile row appears', async () => {
    setAuthenticatedTeacher();
    mockState.profiles = [];
    const user = userEvent.setup();
    renderApp('/walid/students');

    await screen.findByText('تعذر تحميل بيانات الحساب');

    mockState.profiles.push(
      makeProfile({
        id: 'user-teacher-1',
        email: 'teacher@example.com',
        full_name: 'الأستاذ أحمد',
        role: 'teacher',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'إدارة الطلاب' })).toBeInTheDocument();
    });
  });

  it('shows the bootstrap error card when session restore hangs, then recovers on retry', async () => {
    setAuthenticatedStudent();
    const authContext = (await import('../features/auth/AuthContext')) as unknown as {
      AUTH_BOOTSTRAP_TIMEOUT_MS: { value: number };
    };
    authContext.AUTH_BOOTSTRAP_TIMEOUT_MS.value = 20;
    mockState.authGates.getSession = new Promise(() => {});
    const user = userEvent.setup();
    renderApp('/student/dashboard');

    expect(await screen.findByText('تعذر الاتصال بالخادم')).toBeInTheDocument();
    expect(screen.queryByText('جاري التحقق من الحساب')).not.toBeInTheDocument();

    mockState.authGates.getSession = undefined;
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
    });
  });

  it('signs out from the header and lands on the login page', async () => {
    setAuthenticatedStudent();
    const user = userEvent.setup();
    renderApp('/student/dashboard');

    await screen.findByRole('heading', { name: 'لوحة الطالب' });
    await user.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'تسجيل الدخول' })).toBeInTheDocument();
    });
  });

  it('allows a student to open the units page', async () => {
    setAuthenticatedStudent();
    renderApp('/student/units');

    await waitFor(() => {
      // PageHeader renders its own h1 in addition to the LayoutShell h1
      const headings = screen.getAllByRole('heading', { name: 'وحداتي' });
      expect(headings.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('redirects mr_walid away from the student units page', async () => {
    setAuthenticatedWalid();
    renderApp('/student/units');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'إدارة الطلاب' })).toBeInTheDocument();
    });
  });

  it('allows mr_walid to open the codes page', async () => {
    setAuthenticatedWalid();
    renderApp('/walid/codes');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'أكواد الوحدات' })).toBeInTheDocument();
    });
  });

  it('allows an admin to open the pricing page', async () => {
    setAuthenticatedWalid({ role: 'admin', id: 'user-admin-1', email: 'admin@example.com' });
    renderApp('/walid/pricing');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'أسعار الوحدات' })).toBeInTheDocument();
    });
  });

  it('redirects a student away from the codes page', async () => {
    setAuthenticatedStudent();
    renderApp('/walid/codes');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
    });
  });

  it('still clears the session and navigates to login when the remote sign-out fails', async () => {
    setAuthenticatedStudent();
    mockState.signOutError = 'network error';
    const user = userEvent.setup();
    renderApp('/student/dashboard');

    await screen.findByRole('heading', { name: 'لوحة الطالب' });
    await user.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'تسجيل الدخول' })).toBeInTheDocument();
    });
    expect(await screen.findByText('تعذر تسجيل الخروج. حاول مرة أخرى لاحقًا')).toBeInTheDocument();
  });

  it('allows an admin to open the audit log page', async () => {
    setAuthenticatedWalid({ role: 'admin', id: 'user-admin-1', email: 'admin@example.com' });
    renderApp('/admin/audit');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'سجل النشاطات' })).toBeInTheDocument();
    });
  });

  it('allows an admin to open the roles page', async () => {
    setAuthenticatedWalid({ role: 'admin', id: 'user-admin-1', email: 'admin@example.com' });
    renderApp('/admin/roles');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'الأدوار والصلاحيات' })).toBeInTheDocument();
    });
  });

  it('redirects mr_walid away from admin routes', async () => {
    setAuthenticatedWalid();
    renderApp('/admin/audit');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'إدارة الطلاب' })).toBeInTheDocument();
    });
  });

  it('redirects a student away from admin routes', async () => {
    setAuthenticatedStudent();
    renderApp('/admin/roles');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
    });
  });
});
