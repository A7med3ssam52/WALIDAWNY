import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderApp } from '../../test/utils';
import { LAB_CURRI_VARIANTS } from './curri/curriLabsData';

describe('CurriLabsPage', () => {
  it('renders all five curriculum variants', async () => {
    renderApp('/labs/curri');

    expect(await screen.findByTestId('labs-curri', {}, { timeout: 5000 })).toBeInTheDocument();
    for (const variant of LAB_CURRI_VARIANTS) {
      expect(screen.getByTestId(`curri-variant-section-${variant.id}`)).toBeInTheDocument();
    }
    // Each variant root is mounted
    expect(screen.getByTestId('labs-curri1')).toBeInTheDocument();
    expect(screen.getByTestId('labs-curri2')).toBeInTheDocument();
    expect(screen.getByTestId('labs-curri3')).toBeInTheDocument();
    expect(screen.getByTestId('labs-curri4')).toBeInTheDocument();
    expect(screen.getByTestId('labs-curri5')).toBeInTheDocument();
    expect(screen.getByTestId('curri-selected-badge')).toBeInTheDocument();
  });

  it('filters to a single variant', async () => {
    renderApp('/labs/curri');

    expect(await screen.findByTestId('labs-curri', {}, { timeout: 5000 })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('curri-show-3'));

    expect(screen.getByTestId('curri-variant-section-3')).toBeInTheDocument();
    expect(screen.queryByTestId('curri-variant-section-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('labs-curri3-search')).toBeInTheDocument();
  });

  it('variant interactions work (accordion + tabs + search)', async () => {
    renderApp('/labs/curri');

    expect(await screen.findByTestId('labs-curri', {}, { timeout: 5000 })).toBeInTheDocument();

    // Variant 1 accordion toggle
    fireEvent.click(screen.getByTestId('labs-curri1-toggle-unit-3'));
    expect(screen.getByTestId('labs-curri1-lesson-u3-l1')).toBeInTheDocument();

    // Variant 3 search + filter
    fireEvent.change(screen.getByTestId('labs-curri3-search'), { target: { value: 'كيرشوف' } });
    fireEvent.click(screen.getByTestId('labs-curri3-filter-all'));

    // Variant 4 unit switch
    fireEvent.click(screen.getByTestId('labs-curri4-chip-unit-3'));
    expect(screen.getByTestId('labs-curri4-content-unit-3')).toBeInTheDocument();
  });
});
