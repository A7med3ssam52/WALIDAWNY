import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  expectRpcCall,
  getQueryCallCount,
  makeProfile,
  makeUnitPurchase,
  mockRpcError,
  mockState,
  resetMockState,
  setAuthenticatedAdmin,
  setAuthenticatedTeacher,
  setAuthenticatedWalid,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('StudentDetailPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedWalid();
    mockState.profiles.push(
      makeProfile({ id: 's1', full_name: 'طالب التفاصيل', phone: '01001234567' }),
    );
    mockState.grades = [
      {
        id: 'g1',
        name: 'الصف الأول الثانوي',
        sort_order: 1,
        is_active: true,
        deleted_at: null,
        created_at: '2026-01-01T10:00:00.000Z',
        updated_at: '2026-01-01T10:00:00.000Z',
      },
    ];
  });

  it('shows the student details and the available grade', async () => {
    renderApp('/walid/students/s1');

    expect(await screen.findByRole('heading', { name: 'طالب التفاصيل' })).toBeInTheDocument();
    expect(screen.getByText('01001234567')).toBeInTheDocument();
    expect(screen.getAllByText('بدون صف')).toHaveLength(2);
    expect(screen.getByRole('option', { name: 'الصف الأول الثانوي' })).toBeInTheDocument();
  });

  it('shows the student photo and a note when no photo is uploaded', async () => {
    renderApp('/walid/students/s1');

    expect(await screen.findByText('لم يرفع الطالب صورة شخصية بعد.')).toBeInTheDocument();
    expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
  });

  it('shows the student photo when one is uploaded', async () => {
    mockState.profiles.push(
      makeProfile({
        id: 's8',
        full_name: 'طالب بصورة',
        phone: '01008888888',
        avatar_path: 's8/avatar.jpg',
      }),
    );
    renderApp('/walid/students/s8');

    const img = await screen.findByTestId('avatar-image');
    expect(img).toHaveAttribute('src', 'https://storage.test/avatars/s8/avatar.jpg?signed=1');
    expect(img).toHaveAttribute('alt', 'صورة طالب بصورة');
    expect(screen.getByText('الصورة الشخصية مرفوعة من الطالب.')).toBeInTheDocument();
  });

  it('lists the purchased units of the student', async () => {
    mockState.units.push({
      id: 'unit-1',
      grade_id: 'g1',
      name: 'الوحدة الأولى',
      sort_order: 1,
      status: 'published',
      deleted_at: null,
      created_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-01T10:00:00.000Z',
    });
    mockState.unitPurchases.push(
      makeUnitPurchase({ id: 'purchase-1', student_id: 's1', unit_id: 'unit-1', total_price: 350 }),
    );
    renderApp('/walid/students/s1');

    expect(await screen.findByText('الوحدات المشتراة')).toBeInTheDocument();
    expect(await screen.findByText('الوحدة الأولى')).toBeInTheDocument();
    expect(screen.getByText('350 ج.م')).toBeInTheDocument();
    expect(screen.getByTestId('purchase-purchase-1')).toBeInTheDocument();
  });

  it('updates the profile and assigns a grade', async () => {
    const user = userEvent.setup();
    renderApp('/walid/students/s1');

    const nameInput = await screen.findByLabelText('الاسم الكامل');
    await user.clear(nameInput);
    await user.type(nameInput, 'طالب محدث');
    await user.selectOptions(screen.getByLabelText('الصف الدراسي'), 'g1');
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));

    await waitFor(() => {
      expect(expectRpcCall('update_student_profile')).toBeDefined();
    });
    expect(expectRpcCall('update_student_profile')).toEqual({
      p_student_id: 's1',
      p_full_name: 'طالب محدث',
      p_phone: '+201001234567',
      p_guardian_phone: '+201112345678',
      p_address: 'القاهرة',
    });
    expect(expectRpcCall('set_student_grade')).toEqual({ p_student_id: 's1', p_grade_id: 'g1' });
    expect(await screen.findByText('تم تحديث بيانات الطالب')).toBeInTheDocument();
  });

  it('does not call set_student_grade when the grade is unchanged', async () => {
    mockState.profiles.push(makeProfile({ id: 's1', full_name: 'طالب التفاصيل', grade_id: 'g1' }));
    const user = userEvent.setup();
    renderApp('/walid/students/s1');

    await screen.findByLabelText('الاسم الكامل');
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));

    await waitFor(() => {
      expect(expectRpcCall('update_student_profile')).toBeDefined();
    });
    expect(expectRpcCall('set_student_grade')).toBeUndefined();
  });

  it('keeps the grade clear option and reloads the profile when the grade update fails', async () => {
    mockRpcError('set_student_grade', 'student not found');
    const user = userEvent.setup();
    renderApp('/walid/students/s1');

    const gradeSelect = (await screen.findByLabelText('الصف الدراسي')) as HTMLSelectElement;
    const queriesBefore = getQueryCallCount('profiles');
    await user.selectOptions(gradeSelect, 'g1');
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));

    expect(
      await screen.findByText('تم تحديث بيانات الطالب، لكن تعذر تعديل الصف الدراسي'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(getQueryCallCount('profiles')).toBeGreaterThan(queriesBefore);
    });
    expect(screen.getByRole('option', { name: 'بدون صف' })).toBeInTheDocument();
    expect(gradeSelect.value).toBe('');
    expect(
      screen.getByText('تم تحديث بيانات الطالب، لكن تعذر تعديل الصف الدراسي'),
    ).toBeInTheDocument();
  });

  it('disables the student with a mandatory reason from the detail page', async () => {
    const user = userEvent.setup();
    renderApp('/walid/students/s1');

    await screen.findByRole('heading', { name: 'طالب التفاصيل' });
    await user.click(screen.getByRole('button', { name: 'إيقاف الطالب' }));
    await user.click(screen.getByRole('button', { name: 'نعم، إيقاف' }));

    expect(await screen.findByText('سبب الإيقاف مطلوب وسيظهر للطالب')).toBeInTheDocument();

    await user.type(screen.getByLabelText('سبب الإيقاف (إجباري)'), 'مخالفة السياسة');
    await user.click(screen.getByRole('button', { name: 'نعم، إيقاف' }));

    await waitFor(() => {
      expect(expectRpcCall('disable_student')).toEqual({
        p_student_id: 's1',
        p_reason: 'مخالفة السياسة',
      });
    });
    expect(await screen.findByRole('button', { name: 'تفعيل الطالب' })).toBeInTheDocument();
  });

  it('shows the suspension reason for a disabled student and updates it', async () => {
    mockState.profiles.push(
      makeProfile({
        id: 's9',
        full_name: 'طالب موقوف',
        phone: '01009999999',
        status: 'disabled',
        suspension_reason: 'مشاركة الحساب',
      }),
    );
    const user = userEvent.setup();
    renderApp('/walid/students/s9');

    await screen.findByRole('heading', { name: 'طالب موقوف' });
    expect(screen.getByText('مشاركة الحساب')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'تعديل السبب' }));
    const field = screen.getByLabelText('سبب الإيقاف (إجباري)');
    expect(field).toHaveValue('مشاركة الحساب');
    await user.clear(field);
    await user.type(field, 'مخالفة متكررة');
    await user.click(screen.getByRole('button', { name: 'حفظ السبب' }));

    await waitFor(() => {
      expect(expectRpcCall('update_suspension_reason')).toEqual({
        p_student_id: 's9',
        p_reason: 'مخالفة متكررة',
      });
    });
    expect(await screen.findByText('تم تحديث سبب الإيقاف')).toBeInTheDocument();
  });

  it('shows the preview/download button for admin when a photo exists', async () => {
    resetMockState();
    setAuthenticatedAdmin();
    mockState.profiles.push(
      makeProfile({ id: 's1', full_name: 'طالب التفاصيل', phone: '01001234567', avatar_path: 's1/avatar.jpg' }),
    );
    const user = userEvent.setup();
    renderApp('/walid/students/s1');

    await screen.findByRole('heading', { name: 'طالب التفاصيل' });
    await user.click(screen.getByRole('button', { name: 'معاينة / تحميل الصورة' }));

    const dialog = await screen.findByTestId('avatar-preview-dialog');
    expect(dialog).toHaveTextContent('طالب التفاصيل');
    const preview = await within(dialog).findByAltText('صورة طالب التفاصيل');
    expect(preview).toHaveAttribute('src', 'https://storage.test/avatars/s1/avatar.jpg?signed=1');
  });

  it('downloads the photo to the device from the preview', async () => {
    resetMockState();
    setAuthenticatedAdmin();
    mockState.profiles.push(
      makeProfile({ id: 's1', full_name: 'طالب التفاصيل', phone: '01001234567', avatar_path: 's1/avatar.jpg' }),
    );
    const blob = new Blob(['fake-image'], { type: 'image/jpeg' });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
    vi.stubGlobal('fetch', fetchSpy);
    const createSpy = vi.fn().mockReturnValue('blob:mock-url');
    const revokeSpy = vi.fn();
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createSpy as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeSpy as unknown as typeof URL.revokeObjectURL;
    let clickedDownload: string | null = null;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedDownload = this.download;
      });
    try {
      const user = userEvent.setup();
      renderApp('/walid/students/s1');

      await screen.findByRole('heading', { name: 'طالب التفاصيل' });
      await user.click(screen.getByRole('button', { name: 'معاينة / تحميل الصورة' }));
      await screen.findByTestId('avatar-preview-dialog');
      await user.click(screen.getByTestId('avatar-download'));

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith('https://storage.test/avatars/s1/avatar.jpg?signed=1');
      });
      expect(createSpy).toHaveBeenCalledWith(blob);
      await waitFor(() => {
        expect(clickedDownload).toBe('avatar-s1.jpg');
      });
      expect(await screen.findByText('تم تحميل الصورة على جهازك')).toBeInTheDocument();
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      clickSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('keeps the stored extension in the download filename for original-format photos', async () => {
    resetMockState();
    setAuthenticatedAdmin();
    mockState.profiles.push(
      makeProfile({ id: 's1', full_name: 'طالب التفاصيل', phone: '01001234567', avatar_path: 's1/avatar.png' }),
    );
    const blob = new Blob(['fake-image'], { type: 'image/png' });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
    vi.stubGlobal('fetch', fetchSpy);
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    let clickedDownload: string | null = null;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedDownload = this.download;
      });
    try {
      const user = userEvent.setup();
      renderApp('/walid/students/s1');

      await screen.findByRole('heading', { name: 'طالب التفاصيل' });
      await user.click(screen.getByRole('button', { name: 'معاينة / تحميل الصورة' }));
      await screen.findByTestId('avatar-preview-dialog');
      await user.click(screen.getByTestId('avatar-download'));

      await waitFor(() => {
        expect(clickedDownload).toBe('avatar-s1.png');
      });
      expect(await screen.findByText('تم تحميل الصورة على جهازك')).toBeInTheDocument();
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      clickSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('hides the preview/download button for non-admin staff', async () => {
    resetMockState();
    setAuthenticatedTeacher();
    mockState.profiles.push(
      makeProfile({ id: 's1', full_name: 'طالب التفاصيل', phone: '01001234567', avatar_path: 's1/avatar.jpg' }),
    );
    renderApp('/walid/students/s1');

    await screen.findByRole('heading', { name: 'طالب التفاصيل' });
    expect(screen.queryByRole('button', { name: 'معاينة / تحميل الصورة' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('avatar-preview-dialog')).not.toBeInTheDocument();
  });

  it('hides the preview/download button for admin when no photo exists', async () => {
    resetMockState();
    setAuthenticatedAdmin();
    mockState.profiles.push(
      makeProfile({ id: 's1', full_name: 'طالب التفاصيل', phone: '01001234567' }),
    );
    renderApp('/walid/students/s1');

    await screen.findByRole('heading', { name: 'طالب التفاصيل' });
    expect(screen.queryByRole('button', { name: 'معاينة / تحميل الصورة' })).not.toBeInTheDocument();
  });
});
