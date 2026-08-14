import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';

function ThrowingChild(): ReactNode {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders the Arabic fallback when a child throws', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'حدث خطأ غير متوقع' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إعادة تحميل الصفحة' })).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>محتوى سليم</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('محتوى سليم')).toBeInTheDocument();
  });
});
