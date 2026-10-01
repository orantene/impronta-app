/**
 * Client store for the "My presence" first-paint data. The `/talent/site`
 * server route loads it (`loadPublicPageBootstrap`) and seeds it through
 * `PublicPageBootstrapSeed`, so mounting fires ZERO server actions: Next queues
 * a client's server actions one at a time, and six of them on mount were a
 * 10 to 20 second waterfall (a server action called during render is refused
 * outright). Each consumer reads its slice once; every later refresh calls the
 * consumer's own action, so a re-read is always fresh.
 */
import type { PublicPageBootstrap } from "@/lib/talent-site/server/public-page-bootstrap.server";

export type BootstrapSlot = keyof PublicPageBootstrap;

const FRESH_MS = 30_000;

let seeded: PublicPageBootstrap | null = null;
let seededAt = 0;
let taken = new Set<string>();

/** Seed from the server render. Idempotent for the same bundle object. */
export function seedPublicPageBootstrap(bundle: PublicPageBootstrap | null): void {
  // Browser only: module state on the server would outlive the request.
  if (typeof window === "undefined" || bundle === seeded) return;
  seeded = bundle;
  seededAt = Date.now();
  taken = new Set();
}

/**
 * The seeded slice for `slot`, once per consumer; otherwise (not seeded, stale,
 * already read, or the slice failed) the consumer's own `fallback`.
 */
export async function takeOr<S extends BootstrapSlot>(
  slot: S,
  consumer: string,
  fallback: () => Promise<NonNullable<PublicPageBootstrap[S]>>,
): Promise<NonNullable<PublicPageBootstrap[S]>> {
  const key = `${slot}:${consumer}`;
  if (seeded && !taken.has(key) && Date.now() - seededAt < FRESH_MS) {
    taken.add(key);
    const value = seeded[slot];
    if (value != null) return value as NonNullable<PublicPageBootstrap[S]>;
  }
  return fallback();
}

/** Test seam. */
export function resetPublicPageBootstrap(): void {
  seeded = null;
  seededAt = 0;
  taken = new Set();
}
