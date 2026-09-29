import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectRpcCall,
  mockRpcError,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../test/supabase-mock';
import { renderApp } from '../test/utils';
import { resetServerTimeCache } from '../lib/serverTime';

const RECENT_ISO = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

describe('ProfileCompletionModal', () => {
  beforeEach(() => {
    resetMockState();
    resetServerTimeCache();
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

  it('shows full account data with dismiss options inside the grace period', async () => {
    setAuthenticatedStudent({
      full_name: 'أحمد محمد',
      created_at: RECENT_ISO,
    });
    renderApp('/student/dashboard');

    const modal = await screen.findByTestId('profile-completion-modal');
    expect(modal).toHaveTextContent('مراجعة بيانات الملف');
    // Full record for the tracking system.
    expect(modal).toHaveTextContent('student@example.com');
    expect(modal).toHaveTextContent('01001234567');
    expect(modal).toHaveTextContent('القاهرة');
    expect(screen.getByRole('button', { name: 'إغلاق' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تذكيري لاحقاً' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'تذكيري لاحقاً' }));
    expect(screen.queryByTestId('profile-completion-modal')).not.toBeInTheDocument();
  });

  it('explains why full data is needed along with the acceptance rules', async () => {
    setAuthenticatedStudent({
      full_name: 'أحمد محمد',
      created_at: RECENT_ISO,
    });
    renderApp('/student/dashboard');

    const why = await screen.findByTestId('profile-completion-why');
    expect(why).toHaveTextContent('ليه بنطلب البيانات كاملة؟');
    expect(why).toHaveTextContent('منع انتحال الحسابات');
    expect(why).toHaveTextContent('قواعد قبول البيانات');
    expect(why).toHaveTextContent('ثلاثي');
  });

  it('shows a live server-driven countdown inside the grace period', async () => {
    setAuthenticatedStudent({
      full_name: 'أحمد محمد',
      created_at: RECENT_ISO,
    });
    renderApp('/student/dashboard');

    const countdown = await screen.findByTestId('profile-completion-countdown');
    expect(countdown).toHaveTextContent(/متبقي/);
    // ~5 days remain: the number is dynamic, never a hardcoded "7".
    expect(countdown).toHaveTextContent(/أيام/);
    expect(countdown.textContent).not.toMatch(/7 أيام/);
  });

  it('goes mandatory when the server clock passes the deadline', async () => {
    setAuthenticatedStudent({
      full_name: 'أحمد محمد',
      created_at: RECENT_ISO,
    });
    const first = renderApp('/student/dashboard');
    expect(await screen.findByTestId('profile-completion-countdown')).toBeInTheDocument();

    // Six days later on the SERVER clock (device clock untouched).
    first.unmount();
    resetServerTimeCache();
    mockState.serverTimeNow = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
    renderApp('/student/dashboard');

    expect(await screen.findByText(/إجباري ولا يمكن إغلاق/)).toBeInTheDocument();
    expect(screen.queryByTestId('profile-completion-countdown')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إغلاق' })).not.toBeInTheDocument();
  });

  it('fails closed to mandatory when the server clock cannot be fetched', async () => {
    mockRpcError('get_server_time', 'network error');
    setAuthenticatedStudent({
      full_name: 'أحمد محمد',
      created_at: RECENT_ISO,
    });
    renderApp('/student/dashboard');

    expect(await screen.findByTestId('profile-completion-modal')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إغلاق' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-completion-countdown')).not.toBeInTheDocument();
  });

  it('is mandatory with no close option after the 7-day deadline', async () => {
    setAuthenticatedStudent({ full_name: 'أحمد محمد' });
    renderApp('/student/dashboard');

    expect(await screen.findByTestId('profile-completion-modal')).toBeInTheDocument();
    expect(screen.getByText(/إجباري ولا يمكن إغلاق/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إغلاق' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تذكيري لاحقاً' })).not.toBeInTheDocument();
  });

  it('rejects non-triple names and saves a valid Arabic name', async () => {
    const user = userEvent.setup();
    setAuthenticatedStudent({
      full_name: 'أحمد محمد',
      created_at: RECENT_ISO,
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
    setAuthenticatedStudent({
      full_name: 'أحمد محمد علي',
      created_at: RECENT_ISO,
    });
    renderApp('/student/dashboard');

    expect(await screen.findByTestId('profile-completion-modal')).toBeInTheDocument();

    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('رفع الصورة الشخصية'), {
      target: { files: [file] },
    });

    expect(await screen.findByText('تم رفع الصورة الشخصية بنجاح', {}, { timeout: 10000 })).toBeInTheDocument();
    expect(expectRpcCall('set_my_avatar')).toEqual({ p_path: 'user-test-1/avatar.jpg' });
    await screen.findByRole('heading', { name: 'لوحة الطالب' }, { timeout: 10000 });
    expect(screen.queryByTestId('profile-completion-modal')).not.toBeInTheDocument();
  });

  it('reappears in a new session while still in grace', async () => {
    setAuthenticatedStudent({
      full_name: 'أحمد محمد',
      created_at: RECENT_ISO,
    });
    const { unmount } = renderApp('/student/dashboard');

    expect(await screen.findByTestId('profile-completion-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(screen.queryByTestId('profile-completion-modal')).not.toBeInTheDocument();

    // Same session: stays dismissed.
    unmount();
    renderApp('/student/dashboard');
    expect(await screen.findByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
    expect(screen.queryByTestId('profile-completion-modal')).not.toBeInTheDocument();

    // New session: appears again.
    window.sessionStorage.clear();
    unmount();
    renderApp('/student/dashboard');
    expect(await screen.findByTestId('profile-completion-modal')).toBeInTheDocument();
  });
});
