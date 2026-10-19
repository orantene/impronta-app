/**
 * Client store for the workspace Catalog's first-paint list (B5, TUL-1271 #12;
 * the workspace twin of `services-bootstrap.ts`).
 *
 * The `/admin/catalog` and `/admin/menu` routes render two things: a marker
 * (synchronous, so it arrives with the page) that says "a server-loaded list
 * is on its way", and, in its own Suspense boundary, the list itself. The
 * editor's first load:
 *   - takes the list when it is already here (same tenant, fresh, once);
 *   - waits for it while the marker says it is coming (bounded);
 *   - otherwise calls its server action at once (a rail click moves the URL
 *     with history.pushState and renders no page, so no list is coming), and
 *     still takes a list that lands first.
 * Any refusal, a null bundle or a timeout falls back to the action.
 */
import type { CatalogBootstrap } from "@/lib/talent/catalog-bootstrap.server";

type LoadResult = NonNullable<CatalogBootstrap>["result"];
type OkResult = Extract<LoadResult, { ok: true }>;

/** A seed older than this is not taken (it was rendered for an earlier visit). */
export const CATALOG_SEED_FRESH_MS = 30_000;
/** How long a marker keeps the first load waiting for its list. */
export const CATALOG_SEED_WAIT_MS = 8_000;

let seeded: CatalogBootstrap | undefined;
let seededAt = 0;
let taken = false;
let expectedAt = 0;
const listeners = new Set<() => void>();

const inBrowser = () => typeof window !== "undefined";

/** The page's marker: a server-loaded list follows. Call once per page mount. */
export function expectCatalogBootstrap(now = Date.now()): void {
  if (!inBrowser()) return;
  expectedAt = now;
}

/** The server-loaded list (null when the server could not load it). */
export function seedCatalogBootstrap(bundle: CatalogBootstrap, now = Date.now()): void {
  // Browser only: module state on the server would outlive the request.
  if (!inBrowser() || bundle === seeded) return;
  seeded = bundle;
  seededAt = now;
  taken = false;
  expectedAt = 0;
  for (const notify of [...listeners]) notify();
}

/** The seeded list for this workspace, once; otherwise null. */
export function takeCatalogSeed(tenantId: string, now = Date.now()): OkResult | null {
  if (!seeded || taken || seeded.tenantId !== tenantId) return null;
  if (now - seededAt >= CATALOG_SEED_FRESH_MS) return null;
  taken = true;
  return seeded.result.ok ? seeded.result : null;
}

function seedPending(now: number): boolean {
  return expectedAt > 0 && now - expectedAt < CATALOG_SEED_WAIT_MS;
}

/** Resolves with this workspace's list when it lands, or null when a bundle for no one / another tenant lands or `ms` passes. */
function waitForSeed(tenantId: string, ms: number): Promise<OkResult | null> {
  return new Promise((resolve) => {
    const done = (value: OkResult | null) => {
      clearTimeout(timer);
      listeners.delete(onSeed);
      resolve(value);
    };
    const onSeed = () => done(takeCatalogSeed(tenantId));
    const timer = setTimeout(() => done(null), ms);
    listeners.add(onSeed);
  });
}

/**
 * The editor's first load: the server's list when there is one, the action
 * otherwise. `callAction` is the bounded server action the editor already uses.
 */
export function firstCatalogLoad(tenantId: string, callAction: () => Promise<LoadResult>, now = Date.now()): Promise<LoadResult> {
  const ready = takeCatalogSeed(tenantId, now);
  if (ready) return Promise.resolve(ready);
  if (seedPending(now)) {
    return waitForSeed(tenantId, CATALOG_SEED_WAIT_MS - (now - expectedAt)).then((seed) => seed ?? callAction());
  }
  // No list announced: the action goes now. A list that still lands (a router
  // navigation renders the page after the shell mounted) wins the race.
  const late = waitForSeed(tenantId, CATALOG_SEED_WAIT_MS).then((seed) => seed ?? new Promise<never>(() => undefined));
  return Promise.race([callAction(), late]);
}

/** Test seam. */
export function resetCatalogBootstrap(): void {
  seeded = undefined;
  seededAt = 0;
  taken = false;
  expectedAt = 0;
  listeners.clear();
}
