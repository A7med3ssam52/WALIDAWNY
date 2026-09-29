import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectRpcCall,
  mockRpcError,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderWithProviders } from '../../test/utils';
import { StudentProfilePage } from './StudentProfilePage';

describe('StudentProfilePage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedStudent({ full_name: 'أحمد محمد علي', phone: '01001234567' });
  });

  it('loads the current profile into the form', async () => {
    renderWithProviders(<StudentProfilePage />, '/student/profile');

    await waitFor(() => {
      expect(screen.getByLabelText('الاسم الكامل')).toHaveValue('أحمد محمد علي');
    });
    expect(screen.getByLabelText('رقم الهاتف')).toHaveValue('01001234567');
    expect(screen.getByLabelText('العنوان')).toHaveValue('القاهرة');
  });

  it('shows the email as read-only text and never as an editable field', async () => {
    renderWithProviders(<StudentProfilePage />, '/student/profile');

    await waitFor(() => {
      // Shown both on the page and inside the completion modal.
      expect(screen.getAllByText('student@example.com')).toHaveLength(2);
    });
    expect(screen.queryByLabelText('البريد الإلكتروني')).not.toBeInTheDocument();
    expect(screen.getByText(/لا يمكن تعديله/)).toBeInTheDocument();
  });

  it('updates the profile through update_own_profile and shows a success toast', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudentProfilePage />, '/student/profile');

    await waitFor(() => {
      expect(screen.getByLabelText('الاسم الكامل')).toHaveValue('أحمد محمد علي');
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

  it('shows an error toast when the profile save fails due to a network error', async () => {    mockRpcError('update_own_profile', 'network error');
    const user = userEvent.setup();
    renderWithProviders(<StudentProfilePage />, '/student/profile');

    await waitFor(() => {
      expect(screen.getByLabelText('الاسم الكامل')).toHaveValue('أحمد محمد علي');
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

  it('uploads a new avatar and shows it in the profile and the header', async () => {
    renderWithProviders(<StudentProfilePage />, '/student/profile');

    await waitFor(() => {
      expect(screen.getByLabelText('الاسم الكامل')).toHaveValue('أحمد محمد علي');
    });
    expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();

    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('اختيار صورة شخصية'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(expectRpcCall('set_my_avatar')).toEqual({ p_path: 'user-test-1/avatar.jpg' });
    }, { timeout: 10000 });
    expect(await screen.findByText('تم تحديث صورتك الشخصية بنجاح')).toBeInTheDocument();
    // Profile preview + dashboard header both render the photo.
    await waitFor(
      () => {
        expect(screen.getAllByTestId('avatar-image')).toHaveLength(2);
      },
      { timeout: 10000 },
    );
  });

  it('rejects an invalid avatar file without uploading', async () => {
    renderWithProviders(<StudentProfilePage />, '/student/profile');

    await waitFor(() => {
      expect(screen.getByLabelText('الاسم الكامل')).toHaveValue('أحمد محمد علي');
    });

    const file = new File([new Uint8Array([1])], 'photo.gif', { type: 'image/gif' });
    fireEvent.change(screen.getByLabelText('اختيار صورة شخصية'), {
      target: { files: [file] },
    });

    expect(await screen.findByText('الصورة يجب أن تكون JPG أو PNG أو WEBP')).toBeInTheDocument();
    expect(expectRpcCall('set_my_avatar')).toBeUndefined();
  });

  it('removes the avatar and falls back to the initial', async () => {
    const existing = mockState.profiles.find((row) => row.id === 'user-test-1');
    if (existing) {
      existing.avatar_path = 'user-test-1/avatar.jpg';
    }
    const { getRpcCalls } = await import('../../test/supabase-mock');
    renderWithProviders(<StudentProfilePage />, '/student/profile');

    await waitFor(
      () => {
        expect(screen.getAllByTestId('avatar-image')).toHaveLength(2);
      },
      { timeout: 10000 },
    );

    await userEvent.setup().click(screen.getByRole('button', { name: 'حذف الصورة' }));

    await waitFor(() => {
      expect(getRpcCalls().some((call) => call.fn === 'remove_my_avatar')).toBe(true);
    });
    expect(await screen.findByText('تم حذف صورتك الشخصية')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
    });
  });
});
