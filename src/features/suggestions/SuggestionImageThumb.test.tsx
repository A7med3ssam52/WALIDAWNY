import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { invalidateSuggestionUrl } from '../../data/rpc';
import { makeSuggestion, mockState, resetMockState, setAuthenticatedAdmin } from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

const SUG_ID = '5a000000-0000-0000-0000-000000000001';
const IMG_ID = '70000000-0000-0000-0000-0000000000aa';
const CLOUD_PATH = `cloudinary:suggestion-images/${SUG_ID}/${IMG_ID}.jpg:1788000000`;
const SIGNED_URL = `https://res.cloudinary.test/suggestion-images/${SUG_ID}.jpg?signed=1`;

describe('SuggestionImageThumb popup preview', () => {
  beforeEach(() => {
    resetMockState();
    invalidateSuggestionUrl();
    setAuthenticatedAdmin();
    mockState.suggestions.push(
      makeSuggestion({ id: SUG_ID, title: 'مع صورة', image_path: CLOUD_PATH }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes('/functions/v1/suggestion-image-signed-url')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ signed_url: SIGNED_URL }),
          };
        }
        throw new Error(`unexpected fetch: ${String(url)}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the image in an in-app popup instead of an external link', async () => {
    const user = userEvent.setup();
    renderApp('/admin/suggestions');

    const buttons = await screen.findAllByTestId('suggestion-image-button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    const button = buttons[0];
    expect(screen.queryByRole('link', { name: /معاينة/ })).not.toBeInTheDocument();

    await user.click(button);

    const preview = await screen.findByTestId('suggestion-image-preview');
    expect(preview).toBeInTheDocument();
    const fullImage = preview.querySelector('img');
    expect(fullImage?.getAttribute('src')).toBe(SIGNED_URL);

    await user.click(screen.getAllByRole('button', { name: 'إغلاق' })[0]);
    expect(screen.queryByTestId('suggestion-image-preview')).not.toBeInTheDocument();
  });

  it('shows a fallback when the signed URL cannot be resolved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'misconfigured' } }),
      })),
    );
    renderApp('/admin/suggestions');

    // The inbox renders each row twice (desktop table + mobile card).
    const fallbacks = await screen.findAllByText('تعذر تحميل الصورة');
    expect(fallbacks.length).toBeGreaterThanOrEqual(1);
  });
});
