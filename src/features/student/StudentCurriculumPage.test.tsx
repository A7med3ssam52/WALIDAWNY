import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  makeGrade,
  makeLesson,
  makeProgress,
  makeUnit,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('StudentCurriculumPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedStudent({ grade_id: 'grade-1' });
    mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
    mockState.units.push(
      makeUnit({ id: 'unit-1', grade_id: 'grade-1', name: 'الوحدة الأولى', status: 'published' }),
      makeUnit({ id: 'unit-draft', grade_id: 'grade-1', name: 'الوحدة المخفية', status: 'draft' }),
    );
    mockState.lessons.push(
      makeLesson({ id: 'lesson-1', unit_id: 'unit-1', title: 'الدرس الأول', status: 'published' }),
      makeLesson({ id: 'lesson-2', unit_id: 'unit-1', title: 'الدرس الثاني', status: 'published' }),
      makeLesson({ id: 'lesson-hidden', unit_id: 'unit-1', title: 'درس مخفي', status: 'hidden' }),
    );
  });

  it('shows the student grade and only published units and lessons', async () => {
    renderApp('/student/curriculum');

    expect(await screen.findByRole('heading', { name: 'المنهج الدراسي' })).toBeInTheDocument();
    expect(await screen.findByText(/الصف الأول/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'الوحدة الأولى' })).toBeInTheDocument();
    expect(screen.queryByText('الوحدة المخفية')).not.toBeInTheDocument();
    expect(screen.getByText('الدرس الأول')).toBeInTheDocument();
    expect(screen.getByText('الدرس الثاني')).toBeInTheDocument();
    expect(screen.queryByText('درس مخفي')).not.toBeInTheDocument();
  });

  it('links each lesson to its lesson page', async () => {
    renderApp('/student/curriculum');

    const lessonLink = await screen.findByTestId('curriculum-lesson-lesson-2');
    expect(lessonLink).toHaveAttribute('href', '/student/lessons/lesson-2');
  });

  it('shows the completion badge for completed lessons and percent for in-progress ones', async () => {
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

    expect(await screen.findByText('مكتمل')).toBeInTheDocument();
    expect(screen.getByText('40٪')).toBeInTheDocument();
    expect(screen.getByText('جديد')).toBeInTheDocument();
  });

  it('shows the overall progress summary bar', async () => {
    mockState.progress.push(
      makeProgress({ lesson_id: 'lesson-1', percent_completed: 100, is_completed: true }),
    );
    renderApp('/student/curriculum');

    expect(await screen.findByTestId('curriculum-progress-label')).toHaveTextContent(
      '1 من 2 درسًا',
    );
  });

  it('prompts to set the grade when the student has no grade', async () => {
    resetMockState();
    setAuthenticatedStudent({ grade_id: null });
    renderApp('/student/curriculum');

    expect(await screen.findByText(/لم يتم تحديد صفك الدراسي/)).toBeInTheDocument();
  });

  it('shows an empty state when the grade has no published units', async () => {
    mockState.units = [];
    renderApp('/student/curriculum');

    expect(await screen.findByText('لا توجد دروس بعد')).toBeInTheDocument();
  });
});
