/**
 * MAIN vs SECONDARY read-timeout scope (TUL-449).
 *
 * Server-only: uses `AsyncLocalStorage`. Do not import from client-reachable
 * modules — `createBoundedFetch` lives in `bounded-fetch.ts` without Node
 * builtins so the public anon client can stay on the client import graph.
 *
 * TUL-449 — MAIN vs SECONDARY:
 *   - MAIN (default under `failOnReadTimeout`): a timed-out read fails the
 *     whole render (500, never cached). Site / talent / profile rows stay here.
 *   - SECONDARY (`withSecondaryReadDegrade`): a timed-out read degrades only
 *     that section (empty/fallback) and the page stays 200. Reviews, gallery,
 *     availability chips, etc. Discovery `/t/site` stays `force-no-store`; the
 *     vanity host rewrite (TUL-445) uses short CDN revalidate with cookied
 *     responses forced private at the proxy.
 */

import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import {
  BoundedFetchTimeoutError,
  installReadTimeoutScopeBridge,
  type ReadTimeoutScope,
} from "./bounded-fetch";

/**
 * Per-render record of "a Supabase read timed out". A loader that swallows the
 * error would otherwise hand back an empty-but-successful result (no pages, no
 * theme tokens) and the render would serve a hollow site or a false 404.
 * `failOnReadTimeout` turns a MAIN timeout into a thrown error once the work
 * settles; later MAIN reads fail fast so a retry ladder cannot stack deadlines
 * (or fall back to draft columns). SECONDARY timeouts are handled by
 * `withSecondaryReadDegrade` and do not fail the page.
 */
const scope = new AsyncLocalStorage<ReadTimeoutScope>();

installReadTimeoutScopeBridge({ getStore: () => scope.getStore() });

export async function failOnReadTimeout<T>(work: () => Promise<T>): Promise<T> {
  const state: ReadTimeoutScope = {
    mainTimedOut: false,
    secondaryDepth: 0,
    secondaryTimedOut: false,
    degraded: false,
  };
  const result = await scope.run(state, work);
  if (state.mainTimedOut) throw new BoundedFetchTimeoutError("render", 0);
  return result;
}

/** True when a SECONDARY read timed out under the current `failOnReadTimeout`. */
export function secondaryReadDegraded(): boolean {
  return scope.getStore()?.degraded === true;
}

/**
 * Run a SECONDARY section load. A timed-out Supabase read returns `fallback`
 * and is logged; the surrounding `failOnReadTimeout` still returns 200.
 * MAIN-scope timeouts continue to fail the whole render.
 */
export async function withSecondaryReadDegrade<T>(
  label: string,
  work: () => Promise<T>,
  fallback: T,
): Promise<T> {
  const parent = scope.getStore();
  if (!parent) {
    try {
      return await work();
    } catch (err) {
      if (err instanceof BoundedFetchTimeoutError) {
        // eslint-disable-next-line no-console
        console.warn(`[talent-site.secondary-read.${label}]`, err.message);
        return fallback;
      }
      throw err;
    }
  }

  const child: ReadTimeoutScope = {
    mainTimedOut: parent.mainTimedOut,
    secondaryDepth: parent.secondaryDepth + 1,
    secondaryTimedOut: false,
    degraded: false,
  };

  let result: T;
  try {
    result = await scope.run(child, work);
  } catch (err) {
    if (err instanceof BoundedFetchTimeoutError || child.secondaryTimedOut) {
      parent.degraded = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[talent-site.secondary-read.${label}]`,
        err instanceof Error ? err.message : "timed out",
      );
      return fallback;
    }
    throw err;
  }

  if (child.mainTimedOut) parent.mainTimedOut = true;
  if (child.secondaryTimedOut || child.degraded) {
    parent.degraded = true;
    // eslint-disable-next-line no-console
    console.warn(`[talent-site.secondary-read.${label}] timed out; section degraded`);
    return fallback;
  }
  return result;
}
