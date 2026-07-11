/**
 * offer-local-snapshot — W0-2 pure core: a last-resort browser copy of an
 * in-progress offer draft, so an expired session can never cost the coordinator
 * their work.
 *
 * WHY: server saves can fail for auth (session expired), and the fix flow is
 * "log back in" — which navigates away from the editor. Without a local copy the
 * coordinator returns to a $0 server draft and their $5,000 of line items are
 * gone. This module snapshots the FULL editor state (lines + terms + total) to
 * localStorage keyed by offerId on an auth-failure, and offers it back on return.
 *
 * DOM-light: it touches only `window.localStorage` behind typeof guards so it is
 * SSR-safe and unit-testable with an injected storage stub. No React, no i18n.
 *
 * Retention: snapshots older than STALE_MS are ignored on read (a week-old draft
 * is almost certainly obsolete) and a successful server save clears the key.
 */

const PREFIX = "tulala.offerDraft.";
const STALE_MS = 24 * 60 * 60 * 1000; // 24h — a draft older than a day is stale.
const VERSION = 1;

export type OfferSnapshotPayload = {
  version: number;
  offerId: string;
  savedAt: number; // epoch ms
  total: number;
  lineCount: number;
  /** Opaque editor state — the caller serializes its own line/term shape. */
  data: unknown;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function resolveStorage(injected?: StorageLike): StorageLike | null {
  if (injected) return injected;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null; // private mode / disabled storage
  }
}

function keyFor(offerId: string): string {
  return PREFIX + offerId;
}

/**
 * Persist the editor state for `offerId`. Best-effort: a storage failure (quota,
 * private mode) is swallowed — a snapshot is a safety net, never load-bearing.
 * `nowMs` is injectable for deterministic tests.
 */
export function writeOfferSnapshot(
  offerId: string,
  args: { total: number; lineCount: number; data: unknown },
  opts?: { storage?: StorageLike; nowMs?: number },
): boolean {
  const storage = resolveStorage(opts?.storage);
  if (!storage || !offerId) return false;
  const payload: OfferSnapshotPayload = {
    version: VERSION,
    offerId,
    savedAt: opts?.nowMs ?? Date.now(),
    total: args.total,
    lineCount: args.lineCount,
    data: args.data,
  };
  try {
    storage.setItem(keyFor(offerId), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a restorable snapshot for `offerId`, or null when absent, unparseable,
 * wrong version, or stale (> STALE_MS old). Reading never throws.
 */
export function readOfferSnapshot(
  offerId: string,
  opts?: { storage?: StorageLike; nowMs?: number },
): OfferSnapshotPayload | null {
  const storage = resolveStorage(opts?.storage);
  if (!storage || !offerId) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(keyFor(offerId));
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<OfferSnapshotPayload>;
  if (p.version !== VERSION || p.offerId !== offerId || typeof p.savedAt !== "number") {
    return null;
  }
  const now = opts?.nowMs ?? Date.now();
  if (now - p.savedAt > STALE_MS) return null;
  return p as OfferSnapshotPayload;
}

/** Remove the snapshot for `offerId` (after a successful server save). */
export function clearOfferSnapshot(offerId: string, opts?: { storage?: StorageLike }): void {
  const storage = resolveStorage(opts?.storage);
  if (!storage || !offerId) return;
  try {
    storage.removeItem(keyFor(offerId));
  } catch {
    /* best-effort */
  }
}

/** Human "hace 4 min" style age, coarse (for the restore banner label). */
export function snapshotAgeLabel(savedAt: number, nowMs: number, locale: "en" | "es"): string {
  const secs = Math.max(0, Math.round((nowMs - savedAt) / 1000));
  if (secs < 60) return locale === "es" ? "hace un momento" : "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) {
    return locale === "es" ? `hace ${mins} min` : `${mins} min ago`;
  }
  const hrs = Math.round(mins / 60);
  return locale === "es" ? `hace ${hrs} h` : `${hrs}h ago`;
}
