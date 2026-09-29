import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectRpcCall,
  makeGrade,
  makeLesson,
  makeProgress,
  makeUnit,
  makeUnitCode,
  makeUnitPricing,
  makeUnitPurchase,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

function baseSetup() {
  resetMockState();
  setAuthenticatedStudent({ avatar_path: 'user-test-1/avatar.jpg', grade_id: 'grade-1' });
  mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
  mockState.units.push(
    makeUnit({ id: 'unit-1', grade_id: 'grade-1', name: 'الوحدة الأولى', status: 'published' }),
    makeUnit({ id: 'unit-2', grade_id: 'grade-1', name: 'الوحدة الثانية', status: 'published' }),
    makeUnit({ id: 'unit-draft', grade_id: 'grade-1', name: 'الوحدة المخفية', status: 'draft' }),
  );
  mockState.lessons.push(
    makeLesson({ id: 'lesson-1', unit_id: 'unit-1', title: 'الدرس الأول', status: 'published' }),
    makeLesson({ id: 'lesson-2', unit_id: 'unit-1', title: 'الدرس الثاني', status: 'published' }),
    makeLesson({ id: 'lesson-hidden', unit_id: 'unit-1', title: 'درس مخفي', status: 'hidden' }),
  );
  mockState.unitPricing.push(
    makeUnitPricing({ id: 'pricing-1', unit_id: 'unit-1' }),
    makeUnitPricing({ id: 'pricing-2', unit_id: 'unit-2' }),
  );
  mockState.unitPurchases.push(makeUnitPurchase({ id: 'purchase-1', unit_id: 'unit-1' }));
}

// Split-board navigation: units are tabs (sidebar on desktop, chips on mobile),
// the detail panel shows the selected unit. Desktop tabs are always in the DOM.
async function selectUnit(unitId: string) {
  const tab = await screen.findByTestId(`unit-tab-${unitId}`);
  fireEvent.click(tab);
}

describe('StudentCurriculumPage', () => {
  beforeEach(baseSetup);

  it('shows the student grade and only published units and lessons', async () => {
    renderApp('/student/curriculum');

    // PageHeader title is the main heading (h1), LayoutShell title is also h1
    const headings = await screen.findAllByRole('heading', { name: 'المنهج الدراسي', level: 1 });
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText(/الصف الأول/)).length).toBeGreaterThan(0);
    // First unit is auto-selected: its heading + lessons show in the detail panel
    expect(await screen.findByRole('heading', { name: 'الوحدة الأولى' })).toBeInTheDocument();
    expect(await screen.findByTestId('curriculum-lesson-lesson-1')).toBeInTheDocument();
    expect(screen.queryByText('الوحدة المخفية')).not.toBeInTheDocument();
    expect(screen.queryByText('درس مخفي')).not.toBeInTheDocument();
  });

  it('links each lesson to its lesson page when unit is selected', async () => {
    renderApp('/student/curriculum');
    await selectUnit('unit-1');

    const lessonLink = await screen.findByTestId('curriculum-lesson-lesson-2');
    expect(lessonLink).toHaveAttribute('href', '/student/lessons/lesson-2');
  });

  it('shows only the selected unit lessons in the detail panel', async () => {
    renderApp('/student/curriculum');
    await selectUnit('unit-2');

    // Locked unit-2 detail shows the redeem card, unit-1 lessons are hidden
    expect(await screen.findByTestId('unit-detail-unit-2')).toBeInTheDocument();
    expect(screen.queryByTestId('curriculum-lesson-lesson-1')).not.toBeInTheDocument();
  });

  it('shows the completion badge for completed lessons and percent for in-progress ones', async () => {
    baseSetup();
    mockState.progress.push(
      makeProgress({ lesson_id: 'lesson-1', percent_completed: 100, is_completed: true }),
      makeProgress({ lesson_id: 'lesson-2', percent_completed: 40, is_completed: false }),
    );
    mockState.lessons.push(
      makeLesson({
        id: 'lesson-3',
        unit_id: 'unit-1',
        title: 'الدرس الثالث',
        status: 'published',
        sort_order: 3,
      }),
    );
    renderApp('/student/curriculum');
    await selectUnit('unit-1');

    expect(await screen.findByText('مكتمل')).toBeInTheDocument();
    expect(screen.getByText('40٪')).toBeInTheDocument();
    expect(screen.getByText('جديد')).toBeInTheDocument();
  });

  it('shows the overall progress summary bar', async () => {
    baseSetup();
    mockState.progress.push(
      makeProgress({ lesson_id: 'lesson-1', percent_completed: 100, is_completed: true }),
    );
    renderApp('/student/curriculum');

    // Progress bar is at the top level, always visible - use flexible text matcher
    expect(await screen.findByText((content) => content.includes('1 من') && content.includes('درس'))).toBeInTheDocument();
  });

  it('shows a locked unit card with the price for units without a purchase', async () => {
    renderApp('/student/curriculum');
    await selectUnit('unit-2');

    expect(await screen.findByTestId('unit-detail-unit-2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تواصل لتفعيل الوحدة' })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/201000000000'),
    );
    // Locked units do NOT show lessons — only selected purchased units show lessons
    expect(screen.queryByTestId('curriculum-lesson-lesson-1')).not.toBeInTheDocument();
  });

  it('redeems a unit code directly from a locked unit card', async () => {
    mockState.unitCodes.push(makeUnitCode({ id: 'code-2', unit_id: 'unit-2' }));
    renderApp('/student/curriculum');
    await selectUnit('unit-2');

    const unit2Detail = await screen.findByTestId('unit-detail-unit-2');
    fireEvent.change(within(unit2Detail).getByLabelText('كود تفعيل الوحدة الثانية'), {
      target: { value: 'WLDN-ABCD-EFGH-JKLM' },
    });
    fireEvent.click(within(unit2Detail).getByRole('button', { name: 'تفعيل بالكود' }));

    expect(expectRpcCall('redeem_unit_code')).toEqual({ p_code: 'WLDN-ABCD-EFGH-JKLM' });
    expect(await screen.findByText('تم تفعيل الوحدة بنجاح')).toBeInTheDocument();
  });

  it('shows a locked unit card without pricing with a warning message', async () => {
    baseSetup();
    mockState.units.push(makeUnit({ id: 'unit-no-price', grade_id: 'grade-1', name: 'الوحدة بلا سعر', status: 'published' }));
    renderApp('/student/curriculum');
    await selectUnit('unit-no-price');

    const noPriceDetail = await screen.findByTestId('unit-detail-unit-no-price');
    expect(noPriceDetail).toBeInTheDocument();
    expect(within(noPriceDetail).getByText('تواصل مع الإدارة لمعرفة السعر وتفعيل الوحدة')).toBeInTheDocument();
    expect(within(noPriceDetail).queryByRole('link', { name: 'تواصل لتفعيل الوحدة' })).not.toBeInTheDocument();
  });

  it('prompts to set the grade when the student has no grade', async () => {
    resetMockState();
    setAuthenticatedStudent({ grade_id: null, avatar_path: 'user-test-1/avatar.jpg' });
    renderApp('/student/curriculum');

    expect(await screen.findByText(/لم يتم تحديد صفك الدراسي/)).toBeInTheDocument();
  });

  it('shows an empty state when the grade has no published units', async () => {
    baseSetup();
    mockState.units = [];
    renderApp('/student/curriculum');

    expect(await screen.findByText('لا توجد دروس بعد')).toBeInTheDocument();
  });
});
