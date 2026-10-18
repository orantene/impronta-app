/**
 * TUL-1182: client-side loop breaker for the locale-seed hard navigation.
 *
 * The server side already refuses a second hop while the attempt cookie lives, but a
 * cookie that does not persist across the hop (blocked, wrong host, secure/lax quirks) or
 * any other re-entry made the page navigate to the seed route again and again (290 to 497
 * requests in 8 s measured, blank page until a manual reload). Whatever the cause, the
 * browser may now take a given seed hop at most once per window: the second time it paints
 * the page it already has instead of navigating.
 */
export const LOCALE_SEED_HOP_WINDOW_MS = 60_000;
const KEY_PREFIX = "tulala:locale-seed-hop:";

/** Pure: may the browser take this hop now, given when it last took it (ms epoch) or null. */
export function localeSeedHopAllowed(lastHopAt: number | null | undefined, now: number): boolean {
  if (lastHopAt == null || !Number.isFinite(lastHopAt)) return true;
  return now - lastHopAt >= LOCALE_SEED_HOP_WINDOW_MS || now < lastHopAt;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/**
 * Reads and records the hop in one step. Returns true when the caller should navigate.
 * Storage unavailable (private mode, blocked) means we cannot prove it is safe to repeat,
 * so the answer is true only the first time in this document: callers pass `fallbackSeen`.
 */
export function claimLocaleSeedHop(storage: StorageLike | null, href: string, now: number): boolean {
  if (!storage) return true;
  try {
    const raw = storage.getItem(KEY_PREFIX + href);
    const last = raw == null ? null : Number(raw);
    if (!localeSeedHopAllowed(last, now)) return false;
    storage.setItem(KEY_PREFIX + href, String(now));
    return true;
  } catch {
    return true;
  }
}
