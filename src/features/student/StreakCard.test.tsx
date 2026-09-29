import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getRpcCalls,
  makeMyStreak,
  makeProgress,
  mockRpc,
  mockRpcError,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function baseSetup() {
  resetMockState();
  setAuthenticatedStudent({ grade_id: 'grade-1', avatar_path: 'user-test-1/avatar.jpg' });
}

describe('StreakCard', () => {
  beforeEach(baseSetup);

  it('renders the streak count, week dots and freeze button from progress', async () => {
    mockState.progress.push(
      makeProgress({ id: 'p1', lesson_id: 'lesson-1', percent_completed: 50, updated_at: isoDaysAgo(0) }),
      makeProgress({ id: 'p2', lesson_id: 'lesson-2', percent_completed: 40, updated_at: isoDaysAgo(1) }),
    );
    renderApp('/student/dashboard');

    const card = await screen.findByTestId('streak-card', {}, { timeout: 5000 });
    expect(within(card).getByTestId('streak-count')).toHaveTextContent('2');
    expect(within(card).getByTestId('streak-week')).toBeInTheDocument();
    expect(within(card).getByTestId('streak-freeze-btn')).toBeEnabled();
    expect(within(card).getByTestId('streak-freeze-btn')).toHaveTextContent('تجميد يوم');
  });

  it('shows a distinct letter per weekday (س ح ا ث أ خ ج)', async () => {
    mockState.progress.push(
      makeProgress({ id: 'p1', lesson_id: 'lesson-1', percent_completed: 50, updated_at: isoDaysAgo(0) }),
    );
    renderApp('/student/dashboard');

    const card = await screen.findByTestId('streak-card', {}, { timeout: 5000 });
    const week = within(card).getByTestId('streak-week');
    const letters = Array.from(week.querySelectorAll('[data-testid^="streak-day-"]')).map(
      (el) => el.textContent ?? '',
    );
    expect(letters).toHaveLength(7);
    expect([...letters].sort().join('')).toBe([...'سحاثأخج'].sort().join(''));
  });

  it('invites new students to start their streak', async () => {
    renderApp('/student/dashboard');

    const card = await screen.findByTestId('streak-card', {}, { timeout: 5000 });
    expect(within(card).getByText(/ابدأ سلسلتك النهاردة/)).toBeInTheDocument();
  });

  it('freezes a day and confirms with a toast', async () => {
    mockState.progress.push(
      makeProgress({ id: 'p1', lesson_id: 'lesson-1', percent_completed: 50, updated_at: isoDaysAgo(1) }),
    );
    renderApp('/student/dashboard');

    const card = await screen.findByTestId('streak-card', {}, { timeout: 5000 });
    fireEvent.click(within(card).getByTestId('streak-freeze-btn'));

    expect(await screen.findByText('تم تجميد اليوم — سلسلتك محفوظة')).toBeInTheDocument();
    expect(getRpcCalls().some((call) => call.fn === 'use_streak_freeze')).toBe(true);
  });

  it('maps freeze errors to gentle Arabic messages', async () => {
    mockRpcError('use_streak_freeze', 'freeze_already_used');
    renderApp('/student/dashboard');

    const card = await screen.findByTestId('streak-card', {}, { timeout: 5000 });
    fireEvent.click(within(card).getByTestId('streak-freeze-btn'));

    expect(await screen.findByText('استخدمت تجميد هذا الأسبوع بالفعل')).toBeInTheDocument();
  });

  it('celebrates milestones and shows the voucher banner', async () => {
    mockRpc(
      'get_my_streak',
      makeMyStreak({
        current_days: 30,
        flame_stage: 'storm',
        voucher: { status: 'granted', expires_at: isoDaysAgo(-20) },
      }),
    );
    renderApp('/student/dashboard');

    const card = await screen.findByTestId('streak-card', {}, { timeout: 5000 });
    expect(within(card).getByTestId('streak-milestone')).toHaveTextContent('قسيمة الإعفاء');
    const banner = within(card).getByTestId('streak-voucher-banner');
    expect(banner).toHaveTextContent('صالحة');
    expect(within(banner).getByTestId('streak-voucher-cta')).toHaveAttribute('href', '/student/units');
  });

  it('shows a retry card when the streak fails to load', async () => {
    mockRpcError('get_my_streak', 'boom');
    renderApp('/student/dashboard');

    expect(await screen.findByTestId('streak-card-error', {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
