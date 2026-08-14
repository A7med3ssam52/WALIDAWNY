import { describe, it } from 'vitest';

import {
  makeGrade,
  makePlan,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from './supabase-mock';
import { renderApp } from './utils';

describe('scratch debug', () => {
  it('dumps the subscriptions page DOM', async () => {
    resetMockState();
    setAuthenticatedStudent({ grade_id: 'grade-1' });
    mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
    mockState.pricingPlans.push(makePlan({ id: 'plan-1', grade_id: 'grade-1', duration_days: 30 }));
    renderApp('/student/subscriptions');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const main = document.querySelector('main')?.innerHTML ?? 'NO MAIN';
    const cut = main.length > 2000 ? main.slice(0, 2000) : main;
    console.log('MAIN_HTML_START', cut, 'MAIN_HTML_END');
  });
});