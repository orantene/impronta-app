/**
 * Server-side wall-clock trace for the request path, OFF unless
 * `TULALA_PERF_TRACE=1` is in the environment.
 *
 * Why this exists: the admin layout awaits a chain of reads before its first
 * byte, and the only honest way to say which one is slow is to time each one
 * in the process that runs it. Sentry samples spans but does not name the
 * loaders; a `console.time` left in a layout ships to production. This is the
 * one gated helper both can use.
 *
 * Output is one stderr line per span (`[perf] <name> <ms>ms`) and nothing at
 * all when the flag is unset: `timed()` returns the promise it was given.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const ENABLED = process.env.TULALA_PERF_TRACE === "1";

/**
 * The name of the `timed()` span a fetch is running under, for attribution.
 * Kept on `globalThis`: `instrumentation.ts` and the app are separate bundles,
 * so a module-level store would be two stores and every fetch would read the
 * empty one.
 */
const SPAN_STORE_KEY = "__tulalaPerfSpanStore";
type StoreHost = typeof globalThis & { [SPAN_STORE_KEY]?: AsyncLocalStorage<string> };
function spanStore(): AsyncLocalStorage<string> {
  const host = globalThis as StoreHost;
  host[SPAN_STORE_KEY] ??= new AsyncLocalStorage<string>();
  return host[SPAN_STORE_KEY];
}

export function perfTraceEnabled(): boolean {
  return ENABLED;
}

export function timed<T>(name: string, work: Promise<T> | (() => Promise<T>)): Promise<T> {
  if (!ENABLED) return typeof work === "function" ? work() : work;
  installFetchTrace();
  const started = performance.now();
  const promise =
    typeof work === "function" ? spanStore().run(name, work) : work;
  return promise.finally(() => {
    const ms = Math.round(performance.now() - started);
    process.stderr.write(`[perf] ${name} ${ms}ms\n`);
  });
}

/** A request's start mark for `perfMark`; 0 (no clock read) when tracing is off. */
export function perfStart(): number {
  return ENABLED ? performance.now() : 0;
}

/** Marks a point in the request; prints the ms since `startedAt`. */
export function perfMark(name: string, startedAt: number): void {
  if (!ENABLED) return;
  const ms = Math.round(performance.now() - startedAt);
  process.stderr.write(`[perf] ${name} @${ms}ms\n`);
}

/**
 * Counts and times every outbound `fetch` (the Supabase REST + Auth calls are
 * all fetches) and prints one line per call: `[perf] fetch <ms>ms <method>
 * <path> span=<loader>`. Installed lazily by the first `timed()` call (the
 * framework re-patches `fetch` after `register()` runs, which is why this is
 * not done from instrumentation.ts) and only when the flag is on, so
 * production never wraps its fetch.
 */
const FETCH_TRACE_KEY = "__tulalaPerfFetchTraced";
export function installFetchTrace(): void {
  if (!ENABLED) return;
  const current = globalThis.fetch as typeof fetch & { [FETCH_TRACE_KEY]?: boolean };
  if (current[FETCH_TRACE_KEY]) return;
  const original = globalThis.fetch;
  const traced = async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = performance.now();
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    try {
      return await original(input, init);
    } finally {
      const ms = Math.round(performance.now() - started);
      let path = url;
      try {
        const u = new URL(url);
        path = `${u.pathname}${u.search}`.slice(0, 140);
      } catch {
        /* keep the raw string */
      }
      const span = spanStore().getStore() ?? "-";
      process.stderr.write(`[perf] fetch ${ms}ms ${method} ${path} span=${span}\n`);
    }
  };
  (traced as typeof fetch & { [FETCH_TRACE_KEY]?: boolean })[FETCH_TRACE_KEY] = true;
  globalThis.fetch = traced;
}
