import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderApp } from '../../test/utils';

describe('RegisterPage', () => {
  it('redirects to login because new registrations are disabled', async () => {
    renderApp('/register');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'يلا نكمل مذاكرة' })).toBeInTheDocument();
    });
  });
});
