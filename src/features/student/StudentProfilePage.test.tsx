import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  expectRpcCall,
  mockRpcError,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderWithProviders } from '../../test/utils';
import { StudentProfilePage } from './StudentProfilePage';

function stubAvatarFetch(cloudFormat = 'jpg', cloudVersion = 1788000000) {
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    const target = String(url);
    if (target.includes('/functions/v1/avatar-upload-signature')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          upload_url: 'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
          cloud_name: 'test-cloud',
          api_key: 'test-key',
          timestamp: '1788000000',
          signature: 'test-signature',
          public_id: 'avatars/user-test-1/avatar',
        }),
      };
    }
    if (target.includes('api.cloudinary.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ format: cloudFormat, version: cloudVersion }),
      };
    }
    if (target.includes('/functions/v1/avatar-signed-url')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ signed_url: 'https://res.cloudinary.test/avatar.jpg?signed=1' }),
      };
    }
    if (target.includes('/functions/v1/avatar-delete')) {
      return { ok: true, status: 200, json: async () => ({ deleted: true }) };
    }
    throw new Error(`unexpected fetch: ${target}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

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
    const fetchMock = stubAvatarFetch('jpg', 1788000000);
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
      expect(expectRpcCall('set_my_avatar')).toEqual({
        p_path: 'cloudinary:user-test-1/avatar.jpg:1788000000',
      });
    }, { timeout: 10000 });
    // Bytes went to Cloudinary (signed upload), not Supabase Storage.
    expect(fetchMock).toHaveBeenCalledWith(
      'https://test-project.supabase.co/functions/v1/avatar-upload-signature',
      expect.anything(),
    );
    expect(await screen.findByText('تم تحديث صورتك الشخصية بنجاح')).toBeInTheDocument();
    // Profile preview + dashboard header both render the photo.
    await waitFor(
      () => {
        expect(screen.getAllByTestId('avatar-image')).toHaveLength(2);
      },
      { timeout: 10000 },
    );
  });

  it('uploads the original png bytes untouched with the matching pointer', async () => {
    stubAvatarFetch('png', 1788000001);
    renderWithProviders(<StudentProfilePage />, '/student/profile');

    await waitFor(() => {
      expect(screen.getByLabelText('الاسم الكامل')).toHaveValue('أحمد محمد علي');
    });

    const file = new File([new Uint8Array([9, 8, 7])], 'photo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('اختيار صورة شخصية'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(expectRpcCall('set_my_avatar')).toEqual({
        p_path: 'cloudinary:user-test-1/avatar.png:1788000001',
      });
    }, { timeout: 10000 });
    // The Cloudinary response format/version decide the bound pointer —
    // no Supabase Storage upload happened.
    expect(
      mockState.storageUploads.some((item) => item.bucket === 'avatars'),
    ).toBe(false);
    expect(await screen.findByText('تم تحديث صورتك الشخصية بنجاح')).toBeInTheDocument();
  });

  it('rejects an invalid avatar file without uploading', async () => {
    const fetchMock = stubAvatarFetch();
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('removes the avatar and falls back to the initial', async () => {
    const fetchMock = stubAvatarFetch();
    const existing = mockState.profiles.find((row) => row.id === 'user-test-1');
    if (existing) {
      existing.avatar_path = 'cloudinary:user-test-1/avatar.jpg:1788000000';
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
    // Cloudinary bytes are destroyed best-effort before the binding clears.
    expect(fetchMock).toHaveBeenCalledWith(
      'https://test-project.supabase.co/functions/v1/avatar-delete',
      expect.anything(),
    );
    expect(await screen.findByText('تم حذف صورتك الشخصية')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
    });
  });
});
