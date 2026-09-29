import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PhysicsBackground } from './PhysicsBackground';

beforeEach(() => {
  // jsdom لا يدعم Canvas — نمنع ضوضاء "Not implemented" بإرجاع null
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

describe('PhysicsBackground', () => {
  it('renders an aria-hidden canvas that ignores pointer events', () => {
    render(
      <div style={{ position: 'relative', width: 400, height: 300 }}>
        <PhysicsBackground />
      </div>,
    );
    const canvas = screen.getByTestId('physics-background');
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(canvas.className).toContain('pointer-events-none');
  });

  it('renders a static frame when reduced motion is preferred', () => {
    const matchMedia = vi.fn(() => ({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);
    try {
      render(
        <div style={{ position: 'relative', width: 400, height: 300 }}>
          <PhysicsBackground />
        </div>,
      );
      expect(screen.getByTestId('physics-background')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
