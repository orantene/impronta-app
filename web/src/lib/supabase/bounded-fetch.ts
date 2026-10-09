/**
 * Bounded `fetch` for Supabase clients (TUL-444 / TUL-449).
 *
 * supabase-js uses the global `fetch` with no deadline, so one stalled
 * PostgREST/RPC connection (headers sent, body never finished, or no response
 * at all) holds a render or the proxy host lookup until the platform kills the
 * function. This wrapper settles the call after `ms` with a rejected
 * `BoundedFetchTimeoutError`; supabase-js turns that into an `error` result,
 * which callers already treat as "read failed, use the fallback".
 *
 * It deliberately does NOT pass an `AbortSignal` into `fetch`: Next skips its
 * per-render request memoization for signalled requests, which would multiply
 * identical reads. The underlying request is left to finish on its own, and a
 * PostgREST body (small JSON) is buffered inside the race so a stalled body is
 * bounded too.
 *
 * MAIN vs SECONDARY timeout policy (`failOnReadTimeout` /
 * `withSecondaryReadDegrade`) lives in `bounded-fetch-scope.ts` (`server-only`
 * + `node:async_hooks`). This module must stay free of Node builtins: the
 * public anon client imports it, and that client is reachable from client
 * bundles via `FALLBACK_LANGUAGE_SETTINGS` → `pathnames.ts`.
 */

export const SUPABASE_READ_TIMEOUT_MS = 8_000;
export const SUPABASE_SERVICE_TIMEOUT_MS = 12_000;
export const SUPABASE_EDGE_LOOKUP_TIMEOUT_MS = 3_000;

export class BoundedFetchTimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`Supabase request exceeded ${ms}ms: ${url.split("?")[0]}`);
    this.name = "BoundedFetchTimeoutError";
  }
}

type FetchFn = typeof fetch;

export type ReadTimeoutScope = {
  /** MAIN-scope timeout → `failOnReadTimeout` throws after the work settles. */
  mainTimedOut: boolean;
  /** Nesting depth inside `withSecondaryReadDegrade`. */
  secondaryDepth: number;
  /** Timeout inside the current secondary nest (fail-fast siblings there). */
  secondaryTimedOut: boolean;
  /** Any secondary section degraded this render (never cache). */
  degraded: boolean;
};

/**
 * Bridge filled by `bounded-fetch-scope` on the server. Defaults to a no-op so
 * this module stays client-safe (no `node:async_hooks` import).
 */
type ScopeBridge = {
  getStore: () => ReadTimeoutScope | undefined;
};

export const readTimeoutScopeBridge: ScopeBridge = {
  getStore: () => undefined,
};

export function installReadTimeoutScopeBridge(bridge: ScopeBridge): void {
  readTimeoutScopeBridge.getStore = bridge.getStore;
}

function urlOf(input: Parameters<FetchFn>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/** POST RPCs known to be read-only. Everything else that is not GET/HEAD passes through unbounded. */
const READ_ONLY_RPCS = ["talent_site_domain_lookup", "talent_site_subdomain_lookup", "resolve_talent_profile_code"];

/**
 * Only READS are bounded: with no abort, a timed-out write keeps running while
 * the caller retries, which risks duplicate money or webhook writes.
 */
export function isBoundedRead(url: string, method: string): boolean {
  if (!url.includes("/rest/v1/")) return false;
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD") return true;
  return m === "POST" && READ_ONLY_RPCS.some((fn) => url.includes(`/rest/v1/rpc/${fn}`));
}

function shouldFailFast(state: ReadTimeoutScope | undefined): boolean {
  if (!state) return false;
  if (state.mainTimedOut) return true;
  return state.secondaryDepth > 0 && state.secondaryTimedOut;
}

function markTimedOut(state: ReadTimeoutScope | undefined): void {
  if (!state) return;
  if (state.secondaryDepth > 0) {
    state.secondaryTimedOut = true;
    state.degraded = true;
    return;
  }
  state.mainTimedOut = true;
}

export function createBoundedFetch(
  ms: number = SUPABASE_READ_TIMEOUT_MS,
  base: FetchFn = (...args) => fetch(...args),
): FetchFn {
  return async (input, init) => {
    const url = urlOf(input);
    // Only PostgREST reads are bounded (small JSON). Writes, auth, storage and
    // functions pass straight through.
    if (!isBoundedRead(url, init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET"))) return base(input, init);
    const state = readTimeoutScopeBridge.getStore();
    if (shouldFailFast(state)) throw new BoundedFetchTimeoutError(url, 0);
    const work = (async () => {
      const res = await base(input, init);
      const body = await res.arrayBuffer();
      return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
    })();
    // The loser of the race must not surface as an unhandled rejection.
    work.catch(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            markTimedOut(state);
            reject(new BoundedFetchTimeoutError(url, ms));
          }, ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
