import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderApp } from '../../test/utils';
import { NEWUI_VARIANTS } from './newui/newUiData';

describe('NewUiPage', () => {
  it('renders the showroom with all three variant sections', async () => {
    renderApp('/labs/newui');

    expect(await screen.findByTestId('labs-newui', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /نظام الكروت الجديد/ })).toBeInTheDocument();
    for (const variant of NEWUI_VARIANTS) {
      expect(screen.getByTestId(`newui-variant-section-${variant.id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('newui-a-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('newui-b-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('newui-c-dashboard')).toBeInTheDocument();
  });

  it('renders mock KPI content for every variant', async () => {
    renderApp('/labs/newui');

    await screen.findByTestId('labs-newui', {}, { timeout: 5000 });
    for (const id of ['a', 'b', 'c']) {
      expect(screen.getByTestId(`newui-${id}-kpi-students`)).toBeInTheDocument();
      expect(screen.getByTestId(`newui-${id}-chart`)).toBeInTheDocument();
      expect(screen.getByTestId(`newui-${id}-table`)).toBeInTheDocument();
    }
  });

  it('marks variant B as selected for rollout', async () => {
    renderApp('/labs/newui');

    await screen.findByTestId('labs-newui', {}, { timeout: 5000 });
    expect(screen.getByTestId('newui-selected-badge')).toHaveTextContent('مُختار للتعميم');
    expect(screen.getByTestId('newui-variant-section-b')).toContainElement(
      screen.getByTestId('newui-selected-badge'),
    );
  });

  it('filters to a single variant and exposes aria-pressed', async () => {
    renderApp('/labs/newui');

    await screen.findByTestId('labs-newui', {}, { timeout: 5000 });
    fireEvent.click(screen.getByTestId('newui-show-b'));

    expect(screen.getByTestId('newui-show-b')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('newui-show-a')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('newui-variant-section-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('newui-variant-section-b')).toBeInTheDocument();
    expect(screen.queryByTestId('newui-variant-section-c')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('newui-show-all'));
    expect(screen.getByTestId('newui-variant-section-a')).toBeInTheDocument();
    expect(screen.getByTestId('newui-variant-section-c')).toBeInTheDocument();
  });

  it('switches the isolated preview theme without touching the document theme', async () => {
    renderApp('/labs/newui');

    const wrapper = await screen.findByTestId('labs-newui', {}, { timeout: 5000 });
    expect(wrapper).toHaveAttribute('data-theme', 'midnight');
    const before = document.documentElement.getAttribute('data-theme');

    fireEvent.click(screen.getByTestId('newui-theme-paper'));
    expect(wrapper).toHaveAttribute('data-theme', 'paper');
    expect(screen.getByTestId('newui-theme-paper')).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.getAttribute('data-theme')).toBe(before);
  });
});
