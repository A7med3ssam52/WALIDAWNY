import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { expectAuthCall, makeGrade, makeProfile, mockState, resetMockState } from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('RegisterPage', () => {
  beforeEach(() => {
    resetMockState();
    mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول الثانوي' }));
    mockState.grades.push(makeGrade({ id: 'grade-2', name: 'الصف الثاني الثانوي' }));
  });

  const fillValidForm = async (
    user: ReturnType<typeof userEvent.setup>,
    opts?: { skipGrade?: boolean; skipTerms?: boolean },
  ) => {
    await screen.findByLabelText('الاسم الكامل');
    await user.type(screen.getByLabelText('الاسم الكامل'), 'أحمد محمد');
    await user.type(screen.getByLabelText('البريد الإلكتروني'), 'new@example.com');
    await user.type(screen.getByLabelText('رقم الهاتف'), '01001234567');
    await user.type(screen.getByLabelText(/ولي الأمر/), '01112345678');
    await user.type(screen.getByLabelText('العنوان'), 'القاهرة');
    if (!opts?.skipGrade) {
      await user.click(await screen.findByRole('button', { name: 'الصف الأول الثانوي' }));
    }
    await user.type(screen.getByLabelText('كلمة المرور'), 'secret123');
    await user.type(screen.getByLabelText('تأكيد كلمة المرور'), 'secret123');
    if (!opts?.skipTerms) {
      await user.click(screen.getByLabelText(/الشروط والأحكام/));
    }
  };

  it('shows validation errors for an empty form', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    const submitButton = await screen.findByRole('button', { name: 'إنشاء حساب' });
    await user.click(submitButton);

    expect(screen.getByText('الاسم الكامل مطلوب')).toBeInTheDocument();
    expect(screen.getByText('البريد الإلكتروني مطلوب')).toBeInTheDocument();
    expect(screen.getByText('رقم الهاتف مطلوب')).toBeInTheDocument();
    expect(screen.getByText('رقم ولي الأمر مطلوب')).toBeInTheDocument();
    expect(screen.getByText('العنوان مطلوب')).toBeInTheDocument();
    expect(screen.getByText('يجب اختيار الصف الدراسي')).toBeInTheDocument();
    expect(screen.getByText('كلمة المرور مطلوبة')).toBeInTheDocument();
  });

  it('requires a grade and does not sign up without one', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user, { skipGrade: true });
    await user.click(screen.getByRole('button', { name: 'إنشاء حساب' }));

    expect(await screen.findByText('يجب اختيار الصف الدراسي')).toBeInTheDocument();
    expect(expectAuthCall('signUp')).toBeUndefined();
  });

  it('requires terms acceptance and does not sign up without it', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user, { skipTerms: true });
    await user.click(screen.getByRole('button', { name: 'إنشاء حساب' }));

    expect(await screen.findByText('يجب الموافقة على الشروط والأحكام أولاً')).toBeInTheDocument();
    expect(expectAuthCall('signUp')).toBeUndefined();
  });

  it('requires a guardian phone and does not sign up without one', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user);
    const guardianInput = screen.getByLabelText(/ولي الأمر/);
    await user.clear(guardianInput);

    await user.click(screen.getByRole('button', { name: 'إنشاء حساب' }));

    expect(screen.getByText('رقم ولي الأمر مطلوب')).toBeInTheDocument();
    expect(expectAuthCall('signUp')).toBeUndefined();
  });

  it('rejects an invalid guardian phone number', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user);
    const guardianInput = screen.getByLabelText(/ولي الأمر/);
    await user.clear(guardianInput);
    await user.type(guardianInput, '12345');

    await user.click(screen.getByRole('button', { name: 'إنشاء حساب' }));

    expect(screen.getByText('رقم ولي الأمر يجب أن يبدأ بـ 01 أو +20')).toBeInTheDocument();
    expect(expectAuthCall('signUp')).toBeUndefined();
  });

  it('rejects an invalid Egyptian phone number', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user);
    const phoneInput = screen.getByLabelText('رقم الهاتف');
    await user.clear(phoneInput);
    await user.type(phoneInput, '12345');

    await user.click(screen.getByRole('button', { name: 'إنشاء حساب' }));

    expect(screen.getByText('رقم الهاتف يجب أن يبدأ بـ 01 أو +20')).toBeInTheDocument();
  });

  it('rejects identical student and guardian phone numbers', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user);
    const guardianInput = screen.getByLabelText(/ولي الأمر/);
    await user.clear(guardianInput);
    await user.type(guardianInput, '01001234567');

    await user.click(screen.getByRole('button', { name: 'إنشاء حساب' }));

    expect(
      screen.getByText('رقم ولي الأمر يجب أن يكون مختلفًا عن رقم الطالب'),
    ).toBeInTheDocument();
    expect(expectAuthCall('signUp')).toBeUndefined();
  });

  it('rejects identical phones written in different formats', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user);
    const guardianInput = screen.getByLabelText(/ولي الأمر/);
    await user.clear(guardianInput);
    await user.type(guardianInput, '+201001234567');

    await user.click(screen.getByRole('button', { name: 'إنشاء حساب' }));

    expect(
      screen.getByText('رقم ولي الأمر يجب أن يكون مختلفًا عن رقم الطالب'),
    ).toBeInTheDocument();
    expect(expectAuthCall('signUp')).toBeUndefined();
  });

  it('signs up and redirects to the student dashboard when a session is created', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user);
    // The sign-up mock creates the profile; seed the avatar so the
    // avatar gate lets the fresh session through to the dashboard.
    mockState.profiles.push(
      makeProfile({
        id: 'user-test-1',
        email: 'new@example.com',
        avatar_path: 'user-test-1/avatar.jpg',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'إنشاء حساب' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
    });
    expect(expectAuthCall('signUp')).toEqual({
      email: 'new@example.com',
      password: 'secret123',
      options: {
        data: {
          full_name: 'أحمد محمد',
          phone: '+201001234567',
          guardian_phone: '+201112345678',
          address: 'القاهرة',
          grade_id: 'grade-1',
        },
      },
    });
  });

  it('accepts phones typed with Arabic-Indic digits, spaces and dashes', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user);
    const phoneInput = screen.getByLabelText('رقم الهاتف');
    await user.clear(phoneInput);
    await user.type(phoneInput, '٠١٠ ٠١٢٣٤٥٦٧');
    const guardianInput = screen.getByLabelText(/ولي الأمر/);
    await user.clear(guardianInput);
    await user.type(guardianInput, '011-1234-5678');

    mockState.profiles.push(
      makeProfile({
        id: 'user-test-1',
        email: 'new@example.com',
        avatar_path: 'user-test-1/avatar.jpg',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'إنشاء حساب' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
    });
    expect(expectAuthCall('signUp')).toEqual({
      email: 'new@example.com',
      password: 'secret123',
      options: {
        data: {
          full_name: 'أحمد محمد',
          phone: '+201001234567',
          guardian_phone: '+201112345678',
          address: 'القاهرة',
          grade_id: 'grade-1',
        },
      },
    });
  });

  it('shows a confirmation message when email confirmation is required', async () => {
    mockState.signUpCreatesSession = false;
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'إنشاء حساب' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'تم إنشاء حسابك بنجاح' })).toBeInTheDocument();
    });
    expect(screen.getByText(/رابط التفعيل/)).toBeInTheDocument();
  });

  it('shows an Arabic message when the email is already registered', async () => {
    mockState.signUpError = 'User already registered';
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'إنشاء حساب' }));

    await waitFor(() => {
      const form = screen.getByLabelText('الاسم الكامل').closest('form');
      expect(within(form as HTMLElement).getByRole('alert')).toHaveTextContent(
        'هذا البريد الإلكتروني مسجل بالفعل. يمكنك تسجيل الدخول مباشرة',
      );
    });
  });
  it('shows an Arabic message for the GoTrue rate-limit error', async () => {
    mockState.signUpError = 'For security purposes, you can only request this after 30 seconds.';
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'إنشاء حساب' }));

    await waitFor(() => {
      const form = screen.getByLabelText('الاسم الكامل').closest('form');
      expect(within(form as HTMLElement).getByRole('alert')).toHaveTextContent(
        'تم إرسال عدد كبير من الطلبات. حاول مرة أخرى بعد قليل',
      );
    });
  });

  it('shows an Arabic message when the student phone is already registered', async () => {
    mockState.signUpError =
      'duplicate key value violates unique constraint "profiles_phone"';
    const user = userEvent.setup();
    renderApp('/register');

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'إنشاء حساب' }));

    await waitFor(() => {
      const form = screen.getByLabelText('الاسم الكامل').closest('form');
      expect(within(form as HTMLElement).getByRole('alert')).toHaveTextContent(
        'رقم هاتف الطالب مسجل بالفعل، استخدم رقمًا آخر',
      );
    });
  });
});
