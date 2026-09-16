import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectRpcCall,
  makeSuggestion,
  mockRpc,
  mockRpcError,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('StudentSuggestionsPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedStudent();
  });

  it('shows the admin banner message and the submission form when open', async () => {
    renderApp('/student/suggestions');

    expect(await screen.findByTestId('suggestions-banner')).toHaveTextContent('banner-test');
    expect(screen.getByLabelText('النوع')).toBeInTheDocument();
    expect(screen.getByLabelText('العنوان المختصر')).toBeInTheDocument();
    expect(screen.getByLabelText('التفاصيل')).toBeInTheDocument();
    expect(screen.getByTestId('suggestion-submit')).toBeInTheDocument();
  });

  it('validates title and body before submitting', async () => {
    const user = userEvent.setup();
    renderApp('/student/suggestions');

    await screen.findByTestId('suggestion-submit');
    await user.click(screen.getByTestId('suggestion-submit'));

    expect(await screen.findByTestId('suggestion-form-error')).toHaveTextContent('العنوان');
    expect(expectRpcCall('submit_suggestion')).toBeUndefined();
  });

  it('submits a suggestion and shows it in the history', async () => {
    const user = userEvent.setup();
    renderApp('/student/suggestions');

    await screen.findByTestId('suggestion-submit');
    await user.type(screen.getByLabelText('العنوان المختصر'), 'عنوان تجريبي للمقترح');
    await user.type(
      screen.getByLabelText('التفاصيل'),
      'نص تفصيلي طويل بما يكفي لاجتياز التحقق من الصحة',
    );
    await user.click(screen.getByTestId('suggestion-submit'));

    await waitFor(() =>
      expect(expectRpcCall('submit_suggestion')).toEqual({
        p_kind: 'suggestion',
        p_title: 'عنوان تجريبي للمقترح',
        p_body: 'نص تفصيلي طويل بما يكفي لاجتياز التحقق من الصحة',
      }),
    );
    expect(await screen.findByText('تم إرسال مشاركتك بنجاح — شكرًا لمساهمتك')).toBeInTheDocument();
    expect(await screen.findByText('عنوان تجريبي للمقترح')).toBeInTheDocument();
  });

  it('shows the closed message and hides the form when the inbox is closed', async () => {
    mockRpc('get_public_settings', {
      suggestions_open: false,
      suggestions_banner_message: 'banner-test',
      suggestions_closed_message: 'closed-test',
    });
    renderApp('/student/suggestions');

    expect(await screen.findByTestId('suggestions-banner')).toHaveTextContent('closed-test');
    expect(screen.queryByTestId('suggestion-submit')).not.toBeInTheDocument();
  });

  it('renders the student history with kind and status badges', async () => {
    mockState.suggestions.push(
      makeSuggestion({ id: 'sug-1', title: 'مشكلة في الفيديو', kind: 'issue', status: 'planned' }),
    );
    renderApp('/student/suggestions');

    const item = await screen.findByTestId('my-suggestion-sug-1');
    expect(within(item).getByText('مشكلة')).toBeInTheDocument();
    expect(within(item).getByText('مخطط للتحديث')).toBeInTheDocument();
  });

  it('surfaces server validation errors', async () => {
    mockRpcError('submit_suggestion', 'invalid_body');
    const user = userEvent.setup();
    renderApp('/student/suggestions');

    await screen.findByTestId('suggestion-submit');
    await user.type(screen.getByLabelText('العنوان المختصر'), 'عنوان صالح تماما');
    await user.type(screen.getByLabelText('التفاصيل'), 'نص طويل بما يكفي محليا');
    await user.click(screen.getByTestId('suggestion-submit'));

    expect(await screen.findByTestId('suggestion-form-error')).toHaveTextContent('10 أحرف');
  });
});
