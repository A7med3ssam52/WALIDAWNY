import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  mockRpc,
  mockRpcError,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

function liveExam(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exam-live-1',
    grade_id: 'grade-1',
    grade_name: 'الصف الأول',
    title: 'امتحان شامل تجريبي',
    sort_order: 0,
    passing_score: 50,
    status: 'published',
    starts_at: new Date(Date.now() - 60_000).toISOString(),
    ends_at: new Date(Date.now() + 3_600_000).toISOString(),
    duration_minutes: 60,
    show_leaderboard: true,
    question_count: 5,
    attempt_count: 0,
    my_attempt_id: null,
    my_status: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('LiveExamCard', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedStudent({ full_name: 'أحمد محمد' });
  });

  it('shows the card with a CTA when a live exam exists', async () => {
    mockRpc('list_general_exams', [liveExam()]);
    renderApp('/student/dashboard');

    const card = await screen.findByTestId('live-exam-card', {}, { timeout: 5000 });
    expect(card).toHaveTextContent('امتحان جاري الآن');
    expect(card).toHaveTextContent('امتحان شامل تجريبي');
    const cta = screen.getByRole('link', { name: 'ادخل الامتحان الآن' });
    expect(cta).toHaveAttribute('href', '/student/exams/exam-live-1');
  });

  it('stays hidden when the exam was already attempted', async () => {
    mockRpc('list_general_exams', [liveExam({ my_attempt_id: 'att-1', my_status: 'submitted' })]);
    renderApp('/student/dashboard');

    await screen.findByRole('heading', { name: 'لوحة الطالب' }, { timeout: 5000 });
    expect(screen.queryByTestId('live-exam-card')).not.toBeInTheDocument();
  });

  it('stays hidden for upcoming exams and on backend errors', async () => {
    mockRpc('list_general_exams', [
      liveExam({
        id: 'exam-future-1',
        starts_at: new Date(Date.now() + 3_600_000).toISOString(),
        ends_at: new Date(Date.now() + 7_200_000).toISOString(),
      }),
    ]);
    renderApp('/student/dashboard');

    await screen.findByRole('heading', { name: 'لوحة الطالب' }, { timeout: 5000 });
    expect(screen.queryByTestId('live-exam-card')).not.toBeInTheDocument();
  });

  it('never breaks the dashboard when the call fails', async () => {
    mockRpcError('list_general_exams', 'internal_error');
    renderApp('/student/dashboard');

    await screen.findByRole('heading', { name: 'لوحة الطالب' }, { timeout: 5000 });
    expect(screen.queryByTestId('live-exam-card')).not.toBeInTheDocument();
  });

  it('renders the preview rows in /labs/exam without backend', async () => {
    renderApp('/labs/exam');

    const card = await screen.findByTestId('live-exam-card', {}, { timeout: 5000 });
    expect(card).toHaveTextContent('امتحان شامل — الفصل الأول');
    expect(screen.getByRole('link', { name: 'ادخل الامتحان الآن' })).toHaveAttribute(
      'href',
      '/student/exams/lab-card-exam-1',
    );
    expect(card).toHaveTextContent('امتحان آخر');
  });
});
