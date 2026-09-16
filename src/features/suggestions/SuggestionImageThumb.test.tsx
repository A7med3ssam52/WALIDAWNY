import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeSuggestion, mockState, resetMockState, setAuthenticatedAdmin } from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('SuggestionImageThumb popup preview', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedAdmin();
    mockState.suggestions.push(
      makeSuggestion({ id: 'sug-img', title: 'مع صورة', image_path: 'student-1/sug-img.jpg' }),
    );
  });

  it('opens the image in an in-app popup instead of an external link', async () => {
    const user = userEvent.setup();
    renderApp('/admin/suggestions');

    const button = await screen.findByTestId('suggestion-image-button');
    expect(screen.queryByRole('link', { name: /معاينة/ })).not.toBeInTheDocument();

    await user.click(button);

    const preview = await screen.findByTestId('suggestion-image-preview');
    expect(preview).toBeInTheDocument();
    const fullImage = preview.querySelector('img');
    expect(fullImage?.getAttribute('src')).toContain('sug-img.jpg');

    await user.click(screen.getAllByRole('button', { name: 'إغلاق' })[0]);
    expect(screen.queryByTestId('suggestion-image-preview')).not.toBeInTheDocument();
  });
});
