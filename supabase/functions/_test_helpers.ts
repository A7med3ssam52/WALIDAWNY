// Hand-rolled supabase-js stand-in for Edge Function unit tests.
// No network, no npm imports in tests — every query/RPC resolves from the
// config returned by makeStubClient().

export interface StubTableConfig {
  rows?: unknown[];
  count?: number;
  /** Consumed in order by successive count queries (e.g. before/after deltas). */
  countQueue?: number[];
  error?: { message: string; code?: string; details?: string } | null;
}

export interface StubRpcConfig {
  data?: unknown;
  error?: { message: string; code?: string; details?: string } | null;
}

export interface StubStorageConfig {
  signedUrl?: string;
  token?: string;
  uploadError?: { message: string; code?: string } | null;
  error?: { message: string; code?: string } | null;
  removeError?: { message: string; code?: string } | null;
}
export interface StubConfig {
  user?: { id: string } | null;
  getUserError?: { message: string } | null;
  tables?: Record<string, StubTableConfig>;
  rpc?: Record<string, StubRpcConfig>;
  /** Per-bucket storage stubs used by storage.from(bucket).createSignedUploadUrl. */
  storage?: Record<string, StubStorageConfig>;
}

type StubError = { message: string; code?: string; details?: string };

type TableResult = { data: unknown; count?: number; error: StubError | null };

/** Awaitable emulation of a PostgrestFilterBuilder chain. */
export type StubBuilder = Promise<TableResult> & {
  select(columns: string, opts?: { count?: 'exact'; head?: boolean }): StubBuilder;
  eq(column: string, value: unknown): StubBuilder;
  is(column: string, value: unknown): StubBuilder;
  gt(column: string, value: unknown): StubBuilder;
  lt(column: string, value: unknown): StubBuilder;
  lte(column: string, value: unknown): StubBuilder;
  in(column: string, values: unknown[]): StubBuilder;
  maybeSingle(): Promise<{ data: unknown; error: StubError | null }>;
  single(): Promise<{ data: unknown; error: StubError | null }>;
};

export interface StubClientHandle {
  client: {
    auth: {
      getUser(): Promise<{
        data: { user: { id: string } | null };
        error: { message: string } | null;
      }>;
    };
    from(table: string): StubBuilder;
    rpc(
      fn: string,
      args?: Record<string, unknown>,
    ): Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
    storage: {
      from(bucket: string): {
        upload(
          path: string,
          _content: string,
          opts?: { contentType?: string },
        ): Promise<{
          data: { path: string } | null;
          error: { message: string; code?: string } | null;
        }>;
        createSignedUploadUrl(
          path: string,
          options?: { contentType?: string },
        ): Promise<{
          data: { signedUrl: string; path: string; token: string } | null;
          error: { message: string; code?: string } | null;
        }>;
        createSignedUrl(
          path: string,
          expiresIn: number,
        ): Promise<{
          data: { signedUrl: string; path: string; expiresIn: number } | null;
          error: { message: string; code?: string } | null;
        }>;
        remove(
          paths: string[],
        ): Promise<{
          data: { path: string }[] | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  };
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> | undefined }>;
  storageCalls: Array<{
    bucket: string;
    path: string;
    options?: { contentType?: string; expiresIn?: number };
  }>;
}

export function makeStubClient(cfg: StubConfig): StubClientHandle {
  const rpcCalls: StubClientHandle['rpcCalls'] = [];
  const storageCalls: StubClientHandle['storageCalls'] = [];
  const auth = {
    getUser: () =>
      Promise.resolve({
        data: { user: cfg.user ?? null },
        error: cfg.getUserError ?? null,
      }),
  };

  const resultFor = (
    table: string,
    wantsCount: boolean,
    filters: Array<[string, unknown]>,
  ): { data: unknown; count?: number; error: StubError | null } => {
    const t = cfg.tables?.[table] ?? {};
    if (t.error) {
      return { data: null, error: t.error };
    }
    let count: number | undefined;
    if (wantsCount) {
      if (Array.isArray(t.countQueue) && t.countQueue.length > 0) {
        count = t.countQueue.shift();
      } else {
        count = t.count ?? 0;
      }
    }
    const rows = (t.rows ?? []).filter((row) =>
      filters.every(([column, value]) => {
        if (column.startsWith('>')) {
          return (
            ((row as Record<string, unknown>)[column.slice(1)] as string | number) >
            (value as string | number)
          );
        }
        if (column.startsWith('<')) {
          return (
            ((row as Record<string, unknown>)[column.slice(1)] as string | number) <
            (value as string | number)
          );
        }
        const cell = (row as Record<string, unknown>)[column];
        if (Array.isArray(value)) return (value as unknown[]).includes(cell);
        return cell === value;
      }),
    );
    return { data: rows, count, error: null };
  };

  // Emulated PostgrestFilterBuilder chain: every link returns an awaitable
  // object that also carries eq/lte/maybeSingle/select; eq/lte narrow the
  // result set like the real builder does. Results are computed lazily at
  // await time, so count queries consume exactly one countQueue value per
  // query chain (e.g. the before/after delta queries must see different
  // counts while data queries filter rows by eq/lte).
  const builder = (
    table: string,
    filters: Array<[string, unknown]>,
    wantsCount: boolean,
  ): StubBuilder => {
    let cached: TableResult | null = null;
    const compute = (): TableResult => (cached ??= resultFor(table, wantsCount, filters));
    const thenable = {
      then: (onFulfilled: (value: TableResult) => unknown) =>
        Promise.resolve(compute()).then(onFulfilled),
      catch: (onRejected: (reason: unknown) => unknown) =>
        Promise.resolve(compute()).catch(onRejected),
      finally: (onFinally: () => void) => Promise.resolve(compute()).finally(onFinally),
    };
    return Object.assign(thenable, {
      select: (_cols: string, opts?: { count?: 'exact'; head?: boolean }) =>
        builder(table, filters, opts?.count === 'exact'),
      eq: (column: string, value: unknown) =>
        builder(table, [...filters, [column, value]], wantsCount),
      is: (column: string, value: unknown) =>
        builder(table, [...filters, [column, value]], wantsCount),
      gt: (column: string, value: unknown) =>
        builder(table, [...filters, [`>${column}`, value]], wantsCount),
      lt: (column: string, value: unknown) =>
        builder(table, [...filters, [`<${column}`, value]], wantsCount),
      lte: (column: string, value: unknown) =>
        builder(table, [...filters, [column, value]], wantsCount),
      in: (column: string, values: unknown[]) =>
        builder(table, [...filters, [column, values]], wantsCount),
      maybeSingle: () =>
        Promise.resolve({
          data: Array.isArray(compute().data)
            ? ((compute().data as unknown[])[0] ?? null)
            : compute().data,
          error: compute().error,
        }),
      single: () =>
        Promise.resolve({
          data: Array.isArray(compute().data)
            ? ((compute().data as unknown[])[0] ?? null)
            : compute().data,
          error: compute().error,
        }),
    }) as unknown as StubBuilder;
  };

  const client = {
    auth,
    from: (table: string) => builder(table, [], false),
    rpc: (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      const r = cfg.rpc?.[fn] ?? {};
      if (r.error) {
        return Promise.resolve({ data: null, error: r.error });
      }
      return Promise.resolve({ data: r.data ?? [], error: null });
    },
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, _content: string, opts?: { contentType?: string }) => {
          storageCalls.push({ bucket, path, options: { contentType: opts?.contentType } });
          const s = cfg.storage?.[bucket] ?? {};
          if (s.uploadError) {
            return Promise.resolve({ data: null, error: s.uploadError });
          }
          return Promise.resolve({ data: { path }, error: null });
        },
        createSignedUploadUrl: (path: string, options?: { contentType?: string }) => {
          storageCalls.push({ bucket, path, options });
          const s = cfg.storage?.[bucket] ?? {};
          if (s.error) {
            return Promise.resolve({ data: null, error: s.error });
          }
          return Promise.resolve({
            data: {
              signedUrl:
                s.signedUrl ??
                `https://example.supabase.co/storage/v1/object/upload/sign/${bucket}/${path}`,
              path,
              token: s.token ?? 'stub-token',
            },
            error: null,
          });
        },
        createSignedUrl: (path: string, expiresIn: number) => {
          storageCalls.push({ bucket, path, options: { expiresIn } });
          const s = cfg.storage?.[bucket] ?? {};
          if (s.error) {
            return Promise.resolve({ data: null, error: s.error });
          }
          return Promise.resolve({
            data: {
              signedUrl:
                s.signedUrl ??
                `https://example.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=stub-token`,
              path,
              expiresIn,
            },
            error: null,
          });
        },
        remove: (paths: string[]) => {
          storageCalls.push({ bucket, path: paths.join(','), options: undefined });
          const s = cfg.storage?.[bucket] ?? {};
          if (s.removeError) {
            return Promise.resolve({ data: null, error: s.removeError });
          }
          return Promise.resolve({ data: paths.map((path) => ({ path })), error: null });
        },
      }),
    },
  };

  return { client, rpcCalls, storageCalls };
}

export function assert(cond: unknown, msg = 'assertion failed'): asserts cond {
  if (!cond) throw new Error(msg);
}

export function assertEqual<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(msg ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export async function expectStatus(res: Response, status: number): Promise<void> {
  if (res.status !== status) {
    throw new Error(`expected HTTP ${status}, got ${res.status}: ${await res.text()}`);
  }
}

export function deepEqual<T>(actual: T, expected: T): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}
