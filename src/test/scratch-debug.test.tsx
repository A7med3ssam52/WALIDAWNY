import { describe, it } from 'vitest';

import {
  makeGrade,
  makeUnit,
  makeUnitPricing,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from './supabase-mock';
import { renderApp } from './utils';

describe('scratch debug', () => {
  it('dumps the units page DOM', async () => {
    resetMockState();
    setAuthenticatedStudent({ grade_id: 'grade-1' });
    mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
    mockState.units.push(makeUnit({ id: 'unit-1', grade_id: 'grade-1', status: 'published' }));
    mockState.unitPricing.push(makeUnitPricing({ id: 'pricing-1', unit_id: 'unit-1' }));
    renderApp('/student/units');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const main = document.querySelector('main')?.innerHTML ?? 'NO MAIN';
    const cut = main.length > 2000 ? main.slice(0, 2000) : main;
    console.log('MAIN_HTML_START', cut, 'MAIN_HTML_END');
  });
});
