// test/helpers/supabase-mock.ts — minimum viable supabase client mock.
//
// The shell modules import `createBrowserClient` from `@supabase/ssr`
// at module scope; smoke tests that touch those modules need this
// stub so the import doesn't throw on missing env / network access.
//
// Pattern in a test file:
//
//   import { vi } from "vitest";
//   import { mockSupabase } from "../helpers/supabase-mock";
//   vi.mock("@supabase/ssr", () => ({
//     createBrowserClient: () => mockSupabase(),
//   }));
//
// The mock implements only the surface our smoke tests exercise:
// `.from(...).select().eq()`-style chains return empty arrays, and
// `.auth.getUser()` returns a null user. Tests that need richer data
// can override per-call by passing a `data` map to `mockSupabase`.

type QueryResult<T> = Promise<{ data: T | null; error: null }>;

export type SupabaseMockData = Record<string, unknown[]>;

export function mockSupabase(data: SupabaseMockData = {}): unknown {
  const fromTable = (table: string) => {
    const rows = data[table] ?? [];
    const result: QueryResult<unknown[]> = Promise.resolve({ data: rows, error: null });

    // Chainable builder — every operator returns the same builder so
    // arbitrary `.eq().limit().order().single()` chains type-check and
    // resolve to the canned rows.
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: () => builder,
      update: () => builder,
      upsert: () => builder,
      delete: () => builder,
      eq: () => builder,
      neq: () => builder,
      in: () => builder,
      is: () => builder,
      gt: () => builder,
      gte: () => builder,
      lt: () => builder,
      lte: () => builder,
      like: () => builder,
      ilike: () => builder,
      match: () => builder,
      not: () => builder,
      or: () => builder,
      filter: () => builder,
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: result.then.bind(result),
      catch: result.catch.bind(result),
    };
    return builder;
  };

  return {
    from: fromTable,
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        download: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://example.test/file" } }),
      }),
    },
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
      subscribe: () => ({ unsubscribe: () => {} }),
    }),
  };
}
