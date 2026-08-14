import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectRpcCall,
  getQueryCallCount,
  makeProfile,
  mockRpcError,
  mockState,
  resetMockState,
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
      p_phone: '01001234567',
      p_guardian_phone: '01112345678',
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

  it('disables the student from the detail page', async () => {
    const user = userEvent.setup();
    renderApp('/walid/students/s1');

    await screen.findByRole('heading', { name: 'طالب التفاصيل' });
    await user.click(screen.getByRole('button', { name: 'إيقاف الطالب' }));
    await user.click(screen.getByRole('button', { name: 'نعم، إيقاف' }));

    await waitFor(() => {
      expect(expectRpcCall('disable_student')).toEqual({ p_student_id: 's1' });
    });
    expect(await screen.findByRole('button', { name: 'تفعيل الطالب' })).toBeInTheDocument();
  });
});
