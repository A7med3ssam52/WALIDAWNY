import { screen, within } from '@testing-library/react';
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
  setAuthenticatedStudent({ grade_id: 'grade-1' });
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

async function expandUnit(unitName: string) {
  const unitHeading = await screen.findByRole('heading', { name: unitName });
  const unitCard = unitHeading.closest('.glass-card') as HTMLElement;
  const expandButton = within(unitCard).getByRole('button', { name: /الوحدة الأولى|الوحدة الثانية/ });
  if (!expandButton.getAttribute('aria-expanded')?.includes('true')) {
    fireEvent.click(expandButton);
  }
}

import { fireEvent } from '@testing-library/react';

describe('StudentCurriculumPage', () => {
  beforeEach(baseSetup);

  it('shows the student grade and only published units and lessons', async () => {
    renderApp('/student/curriculum');

    // PageHeader title is the main heading (h1), LayoutShell title is also h1
    const headings = await screen.findAllByRole('heading', { name: 'المنهج الدراسي', level: 1 });
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText(/الصف الأول/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'الوحدة الأولى' })).toBeInTheDocument();
    expect(screen.queryByText('الوحدة المخفية')).not.toBeInTheDocument();
    // Lessons are hidden until unit is expanded
    expect(screen.queryByText('الدرس الأول')).not.toBeInTheDocument();
    expect(screen.queryByText('الدرس الثاني')).not.toBeInTheDocument();
  });

  it('links each lesson to its lesson page when unit is expanded', async () => {
    renderApp('/student/curriculum');
    await expandUnit('الوحدة الأولى');

    const lessonLink = await screen.findByTestId('curriculum-lesson-lesson-2');
    expect(lessonLink).toHaveAttribute('href', '/student/lessons/lesson-2');
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
    await expandUnit('الوحدة الأولى');

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

    expect(await screen.findByText('الوحدة الثانية')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تواصل لتفعيل الوحدة' })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/201000000000'),
    );
    // Locked units do NOT show lessons — only purchased units expand to show lessons
    expect(screen.queryByText('الدرس الأول')).not.toBeInTheDocument();
  });

  it('redeems a unit code directly from a locked unit card', async () => {
    mockState.unitCodes.push(makeUnitCode({ id: 'code-2', unit_id: 'unit-2' }));
    renderApp('/student/curriculum');

    const unit2Text = await screen.findByText('الوحدة الثانية');
    const unit2Card = unit2Text.closest('.glass-card') as HTMLElement;
    fireEvent.change(within(unit2Card).getByLabelText('كود تفعيل الوحدة الثانية'), {
      target: { value: 'WLDN-ABCD-EFGH-JKLM' },
    });
    fireEvent.click(within(unit2Card).getByRole('button', { name: 'تفعيل بالكود' }));

    expect(expectRpcCall('redeem_unit_code')).toEqual({ p_code: 'WLDN-ABCD-EFGH-JKLM' });
    expect(await screen.findByText('تم تفعيل الوحدة بنجاح')).toBeInTheDocument();
  });

  it('shows a locked unit card without pricing with a warning message', async () => {
    baseSetup();
    mockState.units.push(makeUnit({ id: 'unit-no-price', grade_id: 'grade-1', name: 'الوحدة بلا سعر', status: 'published' }));
    renderApp('/student/curriculum');

    const noPriceText = await screen.findByText('الوحدة بلا سعر');
    const noPriceCard = noPriceText.closest('.glass-card') as HTMLElement;
    expect(noPriceCard).toBeInTheDocument();
    expect(within(noPriceCard).getByText('تواصل مع الإدارة لمعرفة السعر وتفعيل الوحدة')).toBeInTheDocument();
    expect(within(noPriceCard).queryByRole('link', { name: 'تواصل لتفعيل الوحدة' })).not.toBeInTheDocument();
  });

  it('prompts to set the grade when the student has no grade', async () => {
    resetMockState();
    setAuthenticatedStudent({ grade_id: null });
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
