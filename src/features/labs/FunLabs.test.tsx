import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderApp } from '../../test/utils';
import { LAB_FUN_VARIANTS } from './fun/funLabsData';

describe('FunLabsPage', () => {
  it('renders all five engagement variants', async () => {
    renderApp('/labs/fun');

    expect(await screen.findByTestId('labs-fun', {}, { timeout: 5000 })).toBeInTheDocument();
    for (const variant of LAB_FUN_VARIANTS) {
      expect(screen.getByTestId(`fun-variant-section-${variant.id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('labs-fun1')).toBeInTheDocument();
    expect(screen.getByTestId('labs-fun2')).toBeInTheDocument();
    expect(screen.getByTestId('labs-fun3')).toBeInTheDocument();
    expect(screen.getByTestId('labs-fun4')).toBeInTheDocument();
    expect(screen.getByTestId('labs-fun5')).toBeInTheDocument();
    expect(screen.getByTestId('fun-selected-badge')).toBeInTheDocument();
  });

  it('filters to a single variant', async () => {
    renderApp('/labs/fun');

    expect(await screen.findByTestId('labs-fun', {}, { timeout: 5000 })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('fun-show-2'));

    expect(screen.getByTestId('fun-variant-section-2')).toBeInTheDocument();
    expect(screen.queryByTestId('fun-variant-section-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('labs-fun2')).toBeInTheDocument();
  });

  it('study room interactions work (join + reactions)', async () => {
    renderApp('/labs/fun');

    expect(await screen.findByTestId('labs-fun', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByTestId('fun-room-timer')).toBeInTheDocument();

    // Join a room toggles its CTA
    const join = screen.getByTestId('fun-join-room-2');
    expect(join).toHaveTextContent('انضم للغرفة');
    fireEvent.click(join);
    expect(join).toHaveTextContent('أنت جوّه');

    // Reactions increment
    const react = screen.getByTestId('fun-react-room-1-like');
    expect(react).toHaveTextContent('12');
    fireEvent.click(react);
    expect(react).toHaveTextContent('13');
  });

  it('daily question reveals the result after answering', async () => {
    renderApp('/labs/fun');

    expect(await screen.findByTestId('labs-fun', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByTestId('fun-daily-result')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('fun-daily-choice-0'));
    expect(await screen.findByTestId('fun-daily-result')).toBeInTheDocument();
    expect(screen.getByTestId('fun-daily-result')).toHaveTextContent('عاش');
  });

  it('streak week and badges render', async () => {
    renderApp('/labs/fun');

    expect(await screen.findByTestId('labs-fun', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByTestId('fun-streak-week')).toBeInTheDocument();
    expect(screen.getByTestId('fun-badge-badge-1')).toHaveAttribute('data-earned', 'true');
    expect(screen.getByTestId('fun-badge-badge-4')).toHaveAttribute('data-earned', 'false');
    expect(screen.getByTestId('fun-challenge-bar')).toBeInTheDocument();
  });
});
