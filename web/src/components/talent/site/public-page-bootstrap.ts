/**
 * One mount-time server action for the "My presence" page.
 *
 * Next runs a client's server actions one at a time, so six independent loads
 * on mount (website-settings flag, manager state, Maison bootstrap, go-live
 * summary, available blocks, theme-update notice) queued into a waterfall that
 * held the first paint for 10 to 20 seconds. `PublicPageEditor` now starts ONE
 * bundled action; each consumer reads its slice here, once, and falls back to
 * its own action for every later refresh (so behaviour after a change is
 * identical: a re-read is always fresh).
 */
import type { PublicPageBootstrap } from "@/lib/talent-site/server/public-page-bootstrap-action";
import { loadPublicPageBootstrapAction } from "@/lib/talent-site/server/public-page-bootstrap-action";

export type BootstrapSlot = keyof PublicPageBootstrap;

const FRESH_MS = 20_000;
const DEDUP_MS = 1_000;

let inflight: Promise<PublicPageBootstrap | null> | null = null;
let startedAt = 0;
let taken = new Set<string>();

/** Start the bundled load (idempotent for a second, so a double render shares it). */
export function prefetchPublicPageBootstrap(
  load: () => Promise<PublicPageBootstrap> = loadPublicPageBootstrapAction,
): void {
  if (inflight && Date.now() - startedAt < DEDUP_MS) return;
  startedAt = Date.now();
  taken = new Set();
  inflight = load().then(
    (bundle) => bundle,
    () => null,
  );
}

/**
 * The prefetched slice for `slot`, once per consumer; otherwise (no prefetch,
 * stale, already read, or the slice failed) the consumer's own `fallback`.
 */
export async function takeOr<S extends BootstrapSlot>(
  slot: S,
  consumer: string,
  fallback: () => Promise<NonNullable<PublicPageBootstrap[S]>>,
): Promise<NonNullable<PublicPageBootstrap[S]>> {
  const key = `${slot}:${consumer}`;
  if (inflight && !taken.has(key) && Date.now() - startedAt < FRESH_MS) {
    taken.add(key);
    const bundle = await inflight;
    const value = bundle?.[slot];
    if (value != null) return value as NonNullable<PublicPageBootstrap[S]>;
  }
  return fallback();
}

/** Test seam. */
export function resetPublicPageBootstrap(): void {
  inflight = null;
  startedAt = 0;
  taken = new Set();
}
