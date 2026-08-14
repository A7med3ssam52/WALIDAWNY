import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectRpcCall,
  makeGrade,
  mockState,
  resetMockState,
  setAuthenticatedWalid,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('GradesPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedWalid();
  });

  it('lists active grades with their status', async () => {
    mockState.grades.push(
      makeGrade({ id: 'g1', name: 'الصف الأول', sort_order: 1 }),
      makeGrade({ id: 'g2', name: 'الصف الثاني', sort_order: 2, is_active: false }),
    );
    renderApp('/walid/grades');

    expect(await screen.findByTestId('grade-row-g1')).toBeInTheDocument();
    const rowTwo = screen.getByTestId('grade-row-g2');
    expect(within(rowTwo).getByText('موقوف')).toBeInTheDocument();
    expect(screen.getByText('لا توجد صفوف محذوفة.')).toBeInTheDocument();
  });

  it('creates a grade and adds the row to the list', async () => {
    const user = userEvent.setup();
    renderApp('/walid/grades');

    await user.type(await screen.findByLabelText('اسم الصف'), 'الصف الخامس');
    await user.click(screen.getByRole('button', { name: 'إضافة' }));

    await waitFor(() => {
      expect(expectRpcCall('create_grade')).toEqual({ p_name: 'الصف الخامس', p_sort_order: 0 });
    });
    expect(await screen.findByText('تم إنشاء الصف بنجاح')).toBeInTheDocument();
    expect(await screen.findByText('الصف الخامس')).toBeInTheDocument();
    expect(screen.getByLabelText('اسم الصف')).toHaveValue('');
  });

  it('keeps the form and shows the Arabic error for a duplicate grade name', async () => {
    mockState.grades.push(makeGrade({ id: 'g1', name: 'الصف الأول' }));
    const user = userEvent.setup();
    renderApp('/walid/grades');

    await user.type(await screen.findByLabelText('اسم الصف'), 'الصف الأول');
    await user.click(screen.getByRole('button', { name: 'إضافة' }));

    expect(await screen.findByText('يوجد صف بنفس الاسم')).toBeInTheDocument();
    expect(screen.getByLabelText('اسم الصف')).toHaveValue('الصف الأول');
  });

  it('shows deactivation-style confirmation when deleting a referenced grade, then moves it to the deleted list', async () => {
    mockState.grades.push(makeGrade({ id: 'g1', name: 'الصف الأول' }));
    const user = userEvent.setup();
    renderApp('/walid/grades');

    const row = await screen.findByTestId('grade-row-g1');
    await user.click(within(row).getByRole('button', { name: 'حذف' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('سيتم إيقاف الصف وإخفاؤه من القوائم');
    expect(dialog).toHaveTextContent('يمكنك استعادة الصف لاحقًا');
    await user.click(screen.getByRole('button', { name: 'نعم، حذف' }));

    await waitFor(() => {
      expect(expectRpcCall('delete_grade')).toEqual({ p_grade_id: 'g1' });
    });
    expect(await screen.findByTestId('deleted-grade-row-g1')).toBeInTheDocument();
    expect(screen.queryByTestId('grade-row-g1')).not.toBeInTheDocument();
  });

  it('restores a deleted grade back into the active list', async () => {
    mockState.grades.push(
      makeGrade({ id: 'g1', name: 'الصف الأول', deleted_at: '2026-02-01T10:00:00.000Z' }),
    );
    const user = userEvent.setup();
    renderApp('/walid/grades');

    const deletedRow = await screen.findByTestId('deleted-grade-row-g1');
    await user.click(within(deletedRow).getByRole('button', { name: 'استعادة' }));

    await waitFor(() => {
      expect(expectRpcCall('restore_grade')).toEqual({ p_grade_id: 'g1' });
    });
    expect(await screen.findByTestId('grade-row-g1')).toBeInTheDocument();
    expect(screen.queryByTestId('deleted-grade-row-g1')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no grades', async () => {
    renderApp('/walid/grades');

    expect(await screen.findByText('لا توجد صفوف بعد — أنشئ أول صف')).toBeInTheDocument();
  });
});
