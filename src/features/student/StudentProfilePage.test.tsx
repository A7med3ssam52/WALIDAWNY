import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectRpcCall,
  mockRpcError,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderWithProviders } from '../../test/utils';
import { StudentProfilePage } from './StudentProfilePage';

describe('StudentProfilePage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedStudent({ full_name: 'أحمد محمد', phone: '01001234567' });
  });

  it('loads the current profile into the form', async () => {
    renderWithProviders(<StudentProfilePage />, '/student/profile');

    await waitFor(() => {
      expect(screen.getByLabelText('الاسم الكامل')).toHaveValue('أحمد محمد');
    });
    expect(screen.getByLabelText('رقم الهاتف')).toHaveValue('01001234567');
    expect(screen.getByLabelText('العنوان')).toHaveValue('القاهرة');
  });

  it('shows the email as read-only text and never as an editable field', async () => {
    renderWithProviders(<StudentProfilePage />, '/student/profile');

    await waitFor(() => {
      expect(screen.getByText('student@example.com')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('البريد الإلكتروني')).not.toBeInTheDocument();
    expect(screen.getByText(/لا يمكن تعديله/)).toBeInTheDocument();
  });

  it('updates the profile through update_own_profile and shows a success toast', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudentProfilePage />, '/student/profile');

    await waitFor(() => {
      expect(screen.getByLabelText('الاسم الكامل')).toHaveValue('أحمد محمد');
    });

    const nameInput = screen.getByLabelText('الاسم الكامل');
    await user.clear(nameInput);
    await user.type(nameInput, 'أحمد الجديد');
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));

    await waitFor(() => {
      expect(expectRpcCall('update_own_profile')).toBeDefined();
    });
    expect(expectRpcCall('update_own_profile')).toEqual({
      p_full_name: 'أحمد الجديد',
      p_phone: '+201001234567',
      p_guardian_phone: '+201112345678',
      p_address: 'القاهرة',
    });
    expect(await screen.findByText('تم تحديث بياناتك بنجاح')).toBeInTheDocument();
  });

  it('blocks submission and shows a validation error for an invalid phone', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudentProfilePage />, '/student/profile');

    await waitFor(() => {
      expect(screen.getByLabelText('رقم الهاتف')).toHaveValue('01001234567');
    });

    const phoneInput = screen.getByLabelText('رقم الهاتف');
    await user.clear(phoneInput);
    await user.type(phoneInput, '123');
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));

    expect(screen.getByText('رقم الهاتف يجب أن يبدأ بـ 01 أو +20')).toBeInTheDocument();
    expect(expectRpcCall('update_own_profile')).toBeUndefined();
  });

  it('shows an error toast when the profile save fails due to a network error', async () => {
    mockRpcError('update_own_profile', 'network error');
    const user = userEvent.setup();
    renderWithProviders(<StudentProfilePage />, '/student/profile');

    await waitFor(() => {
      expect(screen.getByLabelText('الاسم الكامل')).toHaveValue('أحمد محمد');
    });

    const nameInput = screen.getByLabelText('الاسم الكامل');
    await user.clear(nameInput);
    await user.type(nameInput, 'أحمد الجديد');
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));

    expect(
      await screen.findByText('تعذر تحديث البيانات. حاول مرة أخرى لاحقًا'),
    ).toBeInTheDocument();
    expect(screen.queryByText('تم تحديث بياناتك بنجاح')).not.toBeInTheDocument();
  });
});
