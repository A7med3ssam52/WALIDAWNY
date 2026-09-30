import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  expectRpcCall,
  resetMockState,
  setAuthenticatedStudent,
} from '../test/supabase-mock';
import { renderApp } from '../test/utils';

describe('ProfileCompletionModal (mandatory)', () => {
  beforeEach(() => {
    resetMockState();
    window.sessionStorage.clear();
  });

  it('stays hidden when the name is triple Arabic and a photo is set', async () => {
    setAuthenticatedStudent({
      full_name: 'أحمد محمد علي',
      avatar_path: 'user-test-1/avatar.jpg',
    });
    renderApp('/student/dashboard');

    expect(await screen.findByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
    expect(screen.queryByTestId('profile-completion-modal')).not.toBeInTheDocument();
  });

  it('shows immediately for an incomplete profile with no close option', async () => {
    setAuthenticatedStudent({
      full_name: 'أحمد محمد',
    });
    renderApp('/student/dashboard');

    const modal = await screen.findByTestId('profile-completion-modal');
    expect(modal).toHaveTextContent('مراجعة بيانات الملف');
    // Full record for the tracking system.
    expect(modal).toHaveTextContent('student@example.com');
    expect(modal).toHaveTextContent('01001234567');
    expect(modal).toHaveTextContent('القاهرة');
    expect(modal).toHaveTextContent('إجباري ولا يمكن إغلاق');
    expect(screen.queryByRole('button', { name: 'إغلاق' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تذكيري لاحقاً' })).not.toBeInTheDocument();
  });

  it('blocks the dashboard route behind the gate until completion', async () => {
    setAuthenticatedStudent({
      full_name: 'أحمد محمد',
    });
    renderApp('/student/dashboard');

    await screen.findByTestId('profile-completion-modal');
    // Gate replaces the page content — no dashboard heading leaks through.
    expect(screen.queryByRole('heading', { name: 'لوحة الطالب' })).not.toBeInTheDocument();
    expect(await screen.findByTestId('profile-gate-message')).toBeInTheDocument();
  });

  it('blocks deep links too (no bypass via direct URL)', async () => {
    setAuthenticatedStudent({
      full_name: 'أحمد محمد علي',
    });
    renderApp('/student/units');

    await screen.findByTestId('profile-completion-modal');
    expect(await screen.findByTestId('profile-gate-message')).toBeInTheDocument();
  });

  it('explains why full data is needed along with the acceptance rules', async () => {
    setAuthenticatedStudent({
      full_name: 'أحمد محمد',
    });
    renderApp('/student/dashboard');

    const why = await screen.findByTestId('profile-completion-why');
    expect(why).toHaveTextContent('ليه بنطلب البيانات كاملة؟');
    expect(why).toHaveTextContent('منع انتحال الحسابات');
    expect(why).toHaveTextContent('قواعد قبول البيانات');
    expect(why).toHaveTextContent('ثلاثي');
  });

  it('rejects non-triple names and saves a valid Arabic name', async () => {
    const user = userEvent.setup();
    setAuthenticatedStudent({
      full_name: 'أحمد محمد',
    });
    renderApp('/student/dashboard');

    await screen.findByTestId('profile-completion-modal');
    await user.click(screen.getByRole('button', { name: 'حفظ الاسم' }));
    expect(await screen.findByText(/ثلاثيًا/)).toBeInTheDocument();
    expect(expectRpcCall('update_own_profile')).toBeUndefined();

    const nameInput = screen.getByLabelText(/الاسم الثلاثي/);
    await user.clear(nameInput);
    await user.type(nameInput, 'أحمد محمد علي');
    await user.click(screen.getByRole('button', { name: 'حفظ الاسم' }));

    await screen.findByText('تم حفظ الاسم بنجاح');
    expect(expectRpcCall('update_own_profile')).toMatchObject({ p_full_name: 'أحمد محمد علي' });
  });

  it('uploads the photo from the modal and closes once complete', async () => {
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
          json: async () => ({ format: 'jpg', version: 1788000000 }),
        };
      }
      if (target.includes('/functions/v1/avatar-signed-url')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ signed_url: 'https://res.cloudinary.test/avatar.jpg?signed=1' }),
        };
      }
      throw new Error(`unexpected fetch: ${target}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    setAuthenticatedStudent({
      full_name: 'أحمد محمد علي',
    });
    renderApp('/student/dashboard');

    expect(await screen.findByTestId('profile-completion-modal')).toBeInTheDocument();

    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('رفع الصورة الشخصية'), {
      target: { files: [file] },
    });

    expect(await screen.findByText('تم رفع الصورة الشخصية بنجاح', {}, { timeout: 10000 })).toBeInTheDocument();
    expect(expectRpcCall('set_my_avatar')).toEqual({
      p_path: 'cloudinary:user-test-1/avatar.jpg:1788000000',
    });
    await screen.findByRole('heading', { name: 'لوحة الطالب' }, { timeout: 10000 });
    expect(screen.queryByTestId('profile-completion-modal')).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
