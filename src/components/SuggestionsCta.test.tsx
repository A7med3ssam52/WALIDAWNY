import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  makeSuggestion,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../test/supabase-mock';
import { renderApp } from '../test/utils';

describe('SuggestionsCta', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedStudent();
    try {
      localStorage.removeItem('suggestions-submitted');
    } catch {
      // ignore
    }
  });

  it('shows the persistent call-to-action when the student has not submitted', async () => {
    renderApp('/student/dashboard');

    const cta = await screen.findByTestId('suggestions-cta');
    expect(cta).toHaveTextContent('ساعدنا نخطط التحديث القادم');
    expect(screen.getByTestId('suggestions-cta-link')).toHaveAttribute(
      'href',
      '/student/suggestions',
    );
  });

  it('collapses into a thanks strip after the student submits', async () => {
    mockState.suggestions.push(makeSuggestion({ student_id: 'user-test-1' }));
    renderApp('/student/dashboard');

    expect(await screen.findByTestId('suggestions-cta-thanks')).toBeInTheDocument();
    expect(screen.queryByTestId('suggestions-cta')).not.toBeInTheDocument();
  });
});
