import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { clearPersisted, readPersisted, usePersistedState, writePersisted } from './usePersistedState';

describe('persisted storage helpers', () => {
  it('round-trips JSON and returns null when missing', () => {
    window.localStorage.removeItem('t:key');
    expect(readPersisted('t:key')).toBeNull();
    writePersisted('t:key', { a: 1 });
    expect(readPersisted<{ a: number }>('t:key')).toEqual({ a: 1 });
    clearPersisted('t:key');
    expect(readPersisted('t:key')).toBeNull();
  });

  it('returns null on corrupt JSON instead of throwing', () => {
    window.localStorage.setItem('t:bad', '{not-json');
    expect(readPersisted('t:bad')).toBeNull();
    window.localStorage.removeItem('t:bad');
  });
});

describe('usePersistedState', () => {
  it('starts from initial and persists updates', () => {
    window.localStorage.removeItem('t:hook');
    const { result, unmount } = renderHook(() => usePersistedState('t:hook', 'start'));
    expect(result.current[0]).toBe('start');
    act(() => {
      result.current[1]('typed');
    });
    expect(result.current[0]).toBe('typed');
    expect(readPersisted('t:hook')).toBe('typed');
    unmount();
    // a fresh mount restores the saved value, not the initial
    const second = renderHook(() => usePersistedState('t:hook', 'start'));
    expect(second.result.current[0]).toBe('typed');
    second.unmount();
    window.localStorage.removeItem('t:hook');
  });

  it('does not write while paused', () => {
    window.localStorage.removeItem('t:paused');
    const { result, unmount, rerender } = renderHook(
      ({ paused }: { paused: boolean }) => usePersistedState('t:paused', 'a', { paused }),
      { initialProps: { paused: true } },
    );
    act(() => {
      result.current[1]('b');
    });
    expect(readPersisted('t:paused')).toBeNull();
    rerender({ paused: false });
    expect(readPersisted('t:paused')).toBe('b');
    unmount();
    window.localStorage.removeItem('t:paused');
  });

  it('clear removes the stored value', () => {
    window.localStorage.removeItem('t:clear');
    const { result, unmount } = renderHook(() => usePersistedState('t:clear', 'x'));
    act(() => {
      result.current[1]('y');
    });
    expect(readPersisted('t:clear')).toBe('y');
    act(() => {
      result.current[2]();
    });
    expect(readPersisted('t:clear')).toBeNull();
    unmount();
  });
});
