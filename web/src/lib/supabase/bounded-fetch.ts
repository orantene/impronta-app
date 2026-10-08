/**
 * Bounded `fetch` for Supabase clients (TUL-444).
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
 */

import { AsyncLocalStorage } from "node:async_hooks";

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

/**
 * Per-render record of "a Supabase read timed out". A loader that swallows the
 * error would otherwise hand back an empty-but-successful result (no pages, no
 * theme tokens) and the render would serve a hollow site or a false 404.
 * `failOnReadTimeout` turns that into a thrown error once the work settles, and
 * later reads in the same scope fail fast so a retry ladder cannot stack
 * deadlines (or fall back to draft columns).
 */
const scope = new AsyncLocalStorage<{ timedOut: boolean }>();

export async function failOnReadTimeout<T>(work: () => Promise<T>): Promise<T> {
  const state = { timedOut: false };
  const result = await scope.run(state, work);
  if (state.timedOut) throw new BoundedFetchTimeoutError("render", 0);
  return result;
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

export function createBoundedFetch(
  ms: number = SUPABASE_READ_TIMEOUT_MS,
  base: FetchFn = (...args) => fetch(...args),
): FetchFn {
  return async (input, init) => {
    const url = urlOf(input);
    // Only PostgREST reads are bounded (small JSON). Writes, auth, storage and
    // functions pass straight through.
    if (!isBoundedRead(url, init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET"))) return base(input, init);
    const state = scope.getStore();
    if (state?.timedOut) throw new BoundedFetchTimeoutError(url, 0);
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
            if (state) state.timedOut = true;
            reject(new BoundedFetchTimeoutError(url, ms));
          }, ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
