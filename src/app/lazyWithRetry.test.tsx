import { Component, Suspense, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cancelChunkRecoveryReload,
  lazyWithRetry,
  retryImport,
  scheduleChunkRecoveryReload,
} from './lazyWithRetry';

class TestBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {}

  render() {
    if (this.state.failed) {
      return <p>تعذر التحميل نهائيًا</p>;
    }
    return this.props.children;
  }
}

describe('lazyWithRetry', () => {
  beforeEach(() => {
    sessionStorage.clear();
    cancelChunkRecoveryReload();
    vi.useRealTimers();
  });

  afterEach(() => {
    cancelChunkRecoveryReload();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves immediately when the import succeeds on the first try', async () => {
    const factory = vi.fn(async () => 'ok');
    await expect(retryImport(factory)).resolves.toBe('ok');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures and resolves when a later attempt succeeds', async () => {
    let calls = 0;
    const factory = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error('Failed to fetch dynamically imported module');
      }
      return 'ok';
    });
    await expect(retryImport(factory, 2, [5, 10])).resolves.toBe('ok');
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('rethrows the last error after exhausting retries', async () => {
    const factory = vi.fn(async () => {
      throw new Error('ChunkLoadError');
    });
    await expect(retryImport(factory, 2, [5, 10])).rejects.toThrow('ChunkLoadError');
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('renders the route after a transient chunk failure without an error flash', async () => {
    let calls = 0;
    const Page = lazyWithRetry(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('Failed to fetch dynamically imported module');
      }
      return { default: () => <p>صفحة محملة</p> };
    });
    render(
      <Suspense fallback={<p>جاري التحميل</p>}>
        <Page />
      </Suspense>,
    );

    expect(await screen.findByText('صفحة محملة')).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('reaches the error boundary when the chunk permanently fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Page = lazyWithRetry(async (): Promise<{ default: () => ReactNode }> => {
      throw new Error('Loading chunk 42 failed');
    });
    render(
      <TestBoundary>
        <Suspense fallback={<p>جاري التحميل</p>}>
          <Page />
        </Suspense>
      </TestBoundary>,
    );

    expect(await screen.findByText('تعذر التحميل نهائيًا', {}, { timeout: 5_000 })).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('fires the recovery reload after the grace period', () => {
    vi.useFakeTimers();
    scheduleChunkRecoveryReload(1_000);

    expect(sessionStorage.getItem('chunk-reload-preload')).toBeNull();
    vi.advanceTimersByTime(1_000);
    expect(sessionStorage.getItem('chunk-reload-preload')).not.toBeNull();
  });

  it('cancels the pending recovery reload', () => {
    vi.useFakeTimers();
    scheduleChunkRecoveryReload(1_000);
    cancelChunkRecoveryReload();

    vi.advanceTimersByTime(5_000);
    expect(sessionStorage.getItem('chunk-reload-preload')).toBeNull();
  });
});
