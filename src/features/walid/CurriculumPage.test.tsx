import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectQueryFilters,
  expectRpcCall,
  makeGrade,
  makeLesson,
  makeUnit,
  mockState,
  resetMockState,
  setAuthenticatedWalid,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

function seedGradeWithUnits() {
  mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
  mockState.units.push(
    makeUnit({ id: 'unit-1', grade_id: 'grade-1', name: 'الوحدة الأولى', sort_order: 1 }),
    makeUnit({ id: 'unit-2', grade_id: 'grade-1', name: 'الوحدة الثانية', sort_order: 2 }),
  );
}

async function selectUnit(user: ReturnType<typeof userEvent.setup>, unitId: string) {
  const row = await screen.findByTestId(`unit-row-${unitId}`);
  await user.click(within(row).getByRole('button', { name: 'اختر' }));
}

describe('CurriculumPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedWalid();
  });

  it('lists grades and the units of the selected grade, with deleted_at null filters on queries', async () => {
    seedGradeWithUnits();
    mockState.units.push(
      makeUnit({ id: 'unit-deleted', grade_id: 'grade-1', deleted_at: '2026-02-01T10:00:00.000Z' }),
    );
    renderApp('/walid/curriculum');

    expect(await screen.findByTestId('unit-row-unit-1')).toBeInTheDocument();
    expect(screen.getByTestId('unit-row-unit-2')).toBeInTheDocument();
    expect(screen.queryByTestId('unit-row-unit-deleted')).not.toBeInTheDocument();

    expect(
      expectQueryFilters('units').some(
        (filter) => filter.column === 'deleted_at' && filter.value === null && filter.op === 'is',
      ),
    ).toBe(true);
    expect(expectQueryFilters('units')).toContainEqual({
      column: 'grade_id',
      value: 'grade-1',
      op: 'eq',
    });
  });

  it('shows an empty hint when there are no active grades', async () => {
    renderApp('/walid/curriculum');

    expect(await screen.findByText('لا توجد صفوف نشطة')).toBeInTheDocument();
    expect(screen.getByText(/أنشئ صفًا أولاً/)).toBeInTheDocument();
  });

  it('shows empty states for a grade without units and a unit without lessons', async () => {
    mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
    const user = userEvent.setup();
    renderApp('/walid/curriculum');

    expect(await screen.findByText('لا توجد وحدات بعد')).toBeInTheDocument();

    await user.type(screen.getByLabelText('اسم الوحدة'), 'الوحدة الأولى');
    await user.click(screen.getByRole('button', { name: 'إضافة وحدة' }));
    expect(await screen.findByText('الوحدة الأولى')).toBeInTheDocument();

    await user.click(screen.getByText('الوحدة الأولى'));
    expect(await screen.findByText('لا توجد دروس بعد')).toBeInTheDocument();
  });

  it('creates a unit and adds it to the list', async () => {
    seedGradeWithUnits();
    const user = userEvent.setup();
    renderApp('/walid/curriculum');

    await user.type(await screen.findByLabelText('اسم الوحدة'), 'الوحدة الثالثة');
    await user.clear(screen.getByLabelText('الترتيب'));
    await user.type(screen.getByLabelText('الترتيب'), '3');
    await user.click(screen.getByRole('button', { name: 'إضافة وحدة' }));

    await waitFor(() => {
      expect(expectRpcCall('create_unit')).toEqual({
        p_grade_id: 'grade-1',
        p_name: 'الوحدة الثالثة',
        p_sort_order: 3,
      });
    });
    expect(await screen.findByText('تم إنشاء الوحدة بنجاح')).toBeInTheDocument();
    expect(await screen.findByText('الوحدة الثالثة')).toBeInTheDocument();
  });

  it('rejects an empty unit name without calling the RPC', async () => {
    seedGradeWithUnits();
    const user = userEvent.setup();
    renderApp('/walid/curriculum');

    await user.click(await screen.findByRole('button', { name: 'إضافة وحدة' }));

    expect(await screen.findByText('اسم الوحدة مطلوب')).toBeInTheDocument();
    expect(expectRpcCall('create_unit')).toBeUndefined();
  });

  it('surfaces a duplicate unit name error as Arabic and keeps the form', async () => {
    seedGradeWithUnits();
    const user = userEvent.setup();
    renderApp('/walid/curriculum');

    await user.type(await screen.findByLabelText('اسم الوحدة'), 'الوحدة الأولى');
    await user.click(screen.getByRole('button', { name: 'إضافة وحدة' }));

    expect(await screen.findByText('يوجد وحدة بنفس الاسم في هذا الصف')).toBeInTheDocument();
    expect(screen.getByLabelText('اسم الوحدة')).toHaveValue('الوحدة الأولى');
  });

  it('renames a unit through the edit modal', async () => {
    seedGradeWithUnits();
    const user = userEvent.setup();
    renderApp('/walid/curriculum');

    const row = await screen.findByTestId('unit-row-unit-1');
    await user.click(within(row).getByRole('button', { name: 'تعديل' }));
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('اسم الوحدة'));
    await user.type(within(dialog).getByLabelText('اسم الوحدة'), 'الوحدة الأولى المعدلة');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => {
      expect(expectRpcCall('update_unit')).toEqual({
        p_unit_id: 'unit-1',
        p_name: 'الوحدة الأولى المعدلة',
        p_sort_order: 1,
      });
    });
    expect(await screen.findByText('تم تحديث الوحدة بنجاح')).toBeInTheDocument();
    expect(await screen.findByText('الوحدة الأولى المعدلة')).toBeInTheDocument();
  });

  it('reorders a unit by editing its sort order in the modal', async () => {
    seedGradeWithUnits();
    const user = userEvent.setup();
    renderApp('/walid/curriculum');

    const row = await screen.findByTestId('unit-row-unit-2');
    await user.click(within(row).getByRole('button', { name: 'تعديل' }));
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('الترتيب'));
    await user.type(within(dialog).getByLabelText('الترتيب'), '9');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => {
      expect(expectRpcCall('update_unit')).toEqual({
        p_unit_id: 'unit-2',
        p_name: 'الوحدة الثانية',
        p_sort_order: 9,
      });
    });
  });

  it('soft-deletes a unit with confirmation and lets the staff restore it', async () => {
    seedGradeWithUnits();
    const user = userEvent.setup();
    renderApp('/walid/curriculum');

    const row = await screen.findByTestId('unit-row-unit-1');
    await user.click(within(row).getByRole('button', { name: 'حذف' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('سيتم نقل الوحدة ودروسها إلى المحذوفات');
    await user.click(screen.getByRole('button', { name: 'نعم، حذف' }));

    await waitFor(() => {
      expect(expectRpcCall('delete_unit')).toEqual({ p_unit_id: 'unit-1' });
    });
    expect(await screen.findByText('تم نقل الوحدة إلى المحذوفات')).toBeInTheDocument();
    expect(screen.queryByTestId('unit-row-unit-1')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /عرض المحذوفة/ }));
    const deletedRow = await screen.findByTestId('deleted-unit-row-unit-1');
    await user.click(within(deletedRow).getByRole('button', { name: 'استعادة' }));

    await waitFor(() => {
      expect(expectRpcCall('restore_unit')).toEqual({ p_unit_id: 'unit-1' });
    });
    expect(await screen.findByTestId('unit-row-unit-1')).toBeInTheDocument();
  });

  it('creates a lesson inside the selected unit', async () => {
    seedGradeWithUnits();
    mockState.lessons.push(makeLesson({ id: 'lesson-1', unit_id: 'unit-1', title: 'الدرس الأول' }));
    const user = userEvent.setup();
    renderApp('/walid/curriculum');

    await selectUnit(user, 'unit-1');
    await user.type(await screen.findByLabelText('عنوان الدرس'), 'درس جديد');
    await user.type(screen.getByLabelText('الوصف'), 'شرح مبسط');
    await user.click(screen.getByRole('button', { name: 'إضافة درس' }));

    await waitFor(() => {
      expect(expectRpcCall('create_lesson')).toEqual({
        p_unit_id: 'unit-1',
        p_title: 'درس جديد',
        p_description: 'شرح مبسط',
        p_sort_order: 0,
      });
    });
    expect(await screen.findByText('تم إنشاء الدرس بنجاح')).toBeInTheDocument();
    expect(await screen.findByText('درس جديد')).toBeInTheDocument();
  });

  it('edits a lesson through the modal', async () => {
    seedGradeWithUnits();
    mockState.lessons.push(makeLesson({ id: 'lesson-1', unit_id: 'unit-1', title: 'الدرس الأول' }));
    const user = userEvent.setup();
    renderApp('/walid/curriculum');

    await selectUnit(user, 'unit-1');
    const row = await screen.findByTestId('lesson-row-lesson-1');
    await user.click(within(row).getByRole('button', { name: 'تعديل' }));
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('عنوان الدرس'));
    await user.type(within(dialog).getByLabelText('عنوان الدرس'), 'الدرس المعدل');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => {
      expect(expectRpcCall('update_lesson')).toEqual({
        p_lesson_id: 'lesson-1',
        p_title: 'الدرس المعدل',
        p_description: null,
        p_sort_order: 1,
      });
    });
    expect(await screen.findByText('الدرس المعدل')).toBeInTheDocument();
  });

  it('publishes a draft lesson and shows the published badge, then hides it', async () => {
    seedGradeWithUnits();
    mockState.lessons.push(makeLesson({ id: 'lesson-1', unit_id: 'unit-1', title: 'الدرس الأول' }));
    const user = userEvent.setup();
    renderApp('/walid/curriculum');

    await selectUnit(user, 'unit-1');
    let row = await screen.findByTestId('lesson-row-lesson-1');
    expect(within(row).getByText('مسودة')).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'نشر' }));
    await waitFor(() => {
      expect(expectRpcCall('publish_lesson')).toEqual({ p_lesson_id: 'lesson-1' });
    });
    expect(await screen.findByText('تم نشر الدرس')).toBeInTheDocument();

    row = await screen.findByTestId('lesson-row-lesson-1');
    expect(within(row).getByText('منشور')).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'إخفاء' }));
    await waitFor(() => {
      expect(expectRpcCall('hide_lesson')).toEqual({ p_lesson_id: 'lesson-1' });
    });
    expect(await screen.findByText('تم إخفاء الدرس')).toBeInTheDocument();

    row = await screen.findByTestId('lesson-row-lesson-1');
    expect(within(row).getByText('مخفي')).toBeInTheDocument();
  });

  it('soft-deletes a lesson with confirmation and restores it from the deleted section', async () => {
    seedGradeWithUnits();
    mockState.lessons.push(makeLesson({ id: 'lesson-1', unit_id: 'unit-1', title: 'الدرس الأول' }));
    const user = userEvent.setup();
    renderApp('/walid/curriculum');

    await selectUnit(user, 'unit-1');
    const row = await screen.findByTestId('lesson-row-lesson-1');
    await user.click(within(row).getByRole('button', { name: 'حذف' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('سيتم نقل الدرس وملفاته إلى المحذوفات');
    await user.click(screen.getByRole('button', { name: 'نعم، حذف' }));

    await waitFor(() => {
      expect(expectRpcCall('soft_delete_lesson')).toEqual({ p_lesson_id: 'lesson-1' });
    });
    expect(screen.queryByTestId('lesson-row-lesson-1')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'عرض المحذوفة (1)' }));
    const deletedRow = await screen.findByTestId('deleted-lesson-row-lesson-1');
    await user.click(within(deletedRow).getByRole('button', { name: 'استعادة' }));

    await waitFor(() => {
      expect(expectRpcCall('restore_lesson')).toEqual({ p_lesson_id: 'lesson-1' });
    });
    expect(await screen.findByTestId('lesson-row-lesson-1')).toBeInTheDocument();
  });

  it('filters soft-deleted lessons out of the main list via a deleted_at null query filter', async () => {
    seedGradeWithUnits();
    mockState.lessons.push(
      makeLesson({ id: 'lesson-1', unit_id: 'unit-1', title: 'الدرس الأول' }),
      makeLesson({
        id: 'lesson-deleted',
        unit_id: 'unit-1',
        title: 'درس محذوف',
        deleted_at: '2026-02-01T10:00:00.000Z',
      }),
    );
    const user = userEvent.setup();
    renderApp('/walid/curriculum');

    await selectUnit(user, 'unit-1');

    expect(await screen.findByTestId('lesson-row-lesson-1')).toBeInTheDocument();
    expect(screen.queryByTestId('lesson-row-lesson-deleted')).not.toBeInTheDocument();
    expect(
      expectQueryFilters('lessons').some(
        (filter) => filter.column === 'deleted_at' && filter.value === null && filter.op === 'is',
      ),
    ).toBe(true);
  });

  it('maps the access_denied RPC error to an Arabic permission message', async () => {
    seedGradeWithUnits();
    mockState.rpcErrors['create_unit'] = 'access_denied';
    const user = userEvent.setup();
    renderApp('/walid/curriculum');

    await user.type(await screen.findByLabelText('اسم الوحدة'), 'وحدة ممنوعة');
    await user.click(screen.getByRole('button', { name: 'إضافة وحدة' }));

    expect(await screen.findByText('ليست لديك صلاحية')).toBeInTheDocument();
  });
});
