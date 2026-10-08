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

function urlOf(input: Parameters<FetchFn>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function createBoundedFetch(
  ms: number = SUPABASE_READ_TIMEOUT_MS,
  base: FetchFn = (...args) => fetch(...args),
): FetchFn {
  return async (input, init) => {
    const url = urlOf(input);
    // Only PostgREST (/rest/v1/) is bounded: its bodies are small JSON. Auth,
    // storage and functions can stream or upload, so they pass straight through.
    const buffer = url.includes("/rest/v1/");
    if (!buffer) return base(input, init);
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
          timer = setTimeout(() => reject(new BoundedFetchTimeoutError(url, ms)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
