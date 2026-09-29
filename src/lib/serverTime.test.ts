import { beforeEach, describe, expect, it } from 'vitest';

import { mockRpcError, mockState, resetMockState } from '../test/supabase-mock';
import { fetchServerOffsetMs, resetServerTimeCache, serverNowMs } from './serverTime';

describe('serverTime', () => {
  beforeEach(() => {
    resetMockState();
    resetServerTimeCache();
  });

  it('computes the offset between server and device clocks', async () => {
    mockState.serverTimeNow = new Date(Date.now() + 90_000).toISOString();

    const offset = await fetchServerOffsetMs();

    expect(offset).toBeGreaterThan(80_000);
    expect(offset).toBeLessThan(100_000);
  });

  it('fetches only once per session (cached)', async () => {
    mockState.serverTimeNow = new Date().toISOString();

    const first = await fetchServerOffsetMs();
    mockState.serverTimeNow = new Date(Date.now() + 3_600_000).toISOString();
    const second = await fetchServerOffsetMs();

    expect(second).toBe(first);
  });

  it('derives now from the cached offset', async () => {
    mockState.serverTimeNow = new Date(Date.now() + 60_000).toISOString();
    await fetchServerOffsetMs();

    expect(serverNowMs()).toBeGreaterThan(Date.now() + 50_000);
  });

  it('throws when the server time cannot be fetched', async () => {
    mockRpcError('get_server_time', 'network error');

    await expect(fetchServerOffsetMs()).rejects.toBeDefined();

    // A failed fetch must not poison the cache: retry works.
    delete mockState.rpcErrors['get_server_time'];
    mockState.serverTimeNow = new Date().toISOString();
    const offset = await fetchServerOffsetMs();
    expect(Math.abs(offset)).toBeLessThan(10_000);
  });
});
