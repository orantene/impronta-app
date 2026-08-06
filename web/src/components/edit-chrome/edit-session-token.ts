/**
 * WAVE1-1.6 — the per-TAB edit-session token, made genuinely per tab.
 *
 * ── The bug this file exists to close ──────────────────────────────────────
 * WS1-D mints a uuid edit-session token and keeps it in `sessionStorage` so it
 * survives a reload. That is right for reloads and WRONG for tab duplication:
 * "Duplicate tab" (and "Open in new tab" from history) COPIES sessionStorage
 * wholesale into the new tab. Two live tabs then carried the SAME token, their
 * `Date.now()`-seeded `draft_seq` values interleaved, and the server's
 * same-session last-write-wins lane (`maybeAdoptSameSessionSave` /
 * `applyHomepageDraftBeacon`) ADOPTED one tab's write as if it were the other
 * tab's own. Result: silent cross-tab last-write-wins with no conflict toast —
 * exactly the class the CAS exists to surface.
 *
 * ── Why not simply stop persisting the token ───────────────────────────────
 * Because the persistence is load-bearing. W1-L2 relies on the token surviving
 * the editor's OWN full-page reload (F5, leaving mobile edit mode): the pagehide
 * beacon writes and bumps `version`, so the reloaded editor's first save carries
 * a stale `expectedVersion` for its own prior write. Same-token adoption is what
 * turns that into a save instead of a false VERSION_CONFLICT. Minting per page
 * load would bring the false-conflict class straight back.
 *
 * ── The discriminator ──────────────────────────────────────────────────────
 * Two independent signals, both synchronous:
 *
 *   1. NAVIGATION TYPE. A reload or a back/forward restore is unambiguously the
 *      SAME tab, so a stored token is reused with no further questions. This is
 *      the W1-L2 path and it must never be weakened by heuristics.
 *
 *   2. HELD-LEASE. For a plain `navigate` (which is what a DUPLICATED tab
 *      reports, and also what a same-tab hard navigation reports) we ask whether
 *      any OTHER document is currently holding this token. A holder writes a
 *      claim into `localStorage` — shared across tabs, unlike sessionStorage —
 *      and REMOVES it on `pagehide`. So:
 *        - duplicated tab: the original is still open and has not released, the
 *          claim is present, the copy MINTS A NEW TOKEN and its conflicts become
 *          honest again.
 *        - same-tab hard navigation: the previous document released on pagehide,
 *          nothing holds the claim, the token is reused.
 *
 *      The signal is PRESENCE, deliberately not freshness. An earlier draft
 *      heartbeated a timestamp and treated a several-second-old claim as dead —
 *      which is wrong in this product, because background tabs have their timers
 *      throttled to roughly once a minute (and automation tabs run permanently
 *      backgrounded). A duplicated-but-idle tab would then have looked dead and
 *      gone straight back to sharing the token. The stored timestamp now only
 *      garbage-collects claims left by a tab that crashed days ago.
 *
 * Failing "unsure" re-mints, which is the safe direction: the worst case is one
 * honest conflict toast, never a silent overwrite. And it cannot cost us the
 * W1-L2 adoption path, because a reload never consults the lease at all.
 *
 * This module is intentionally pure + injectable so the two directions can be
 * tested without a browser. `presence-provider.tsx` wires the real browser
 * objects into it.
 */

export interface EditSessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const EDIT_SESSION_STORAGE_KEY = "edit:session-id";
export const EDIT_SESSION_LEASE_PREFIX = "edit:session-lease:";

/**
 * Garbage-collection horizon ONLY. A claim this old belongs to a tab that
 * crashed long ago, so it stops blocking reuse. It is deliberately far longer
 * than any timer-throttling window: presence, not freshness, is the signal.
 */
export const EDIT_SESSION_LEASE_STALE_MS = 12 * 60 * 60 * 1_000;

export function editSessionLeaseKey(token: string): string {
  return `${EDIT_SESSION_LEASE_PREFIX}${token}`;
}

export interface EditSessionEnv {
  /** Per-tab storage (real: `sessionStorage`). `null` when blocked. */
  session: EditSessionStorageLike | null;
  /** Cross-tab storage for the liveness lease (real: `localStorage`). */
  local: EditSessionStorageLike | null;
  /**
   * `PerformanceNavigationTiming.type` for this document: "reload",
   * "back_forward", "navigate" or "prerender". `null` when unavailable.
   */
  navigationType: string | null;
  now: () => number;
  mintUuid: () => string;
}

export type EditSessionTokenReason =
  /** No stored token — first edit session in this tab. */
  | "minted-fresh"
  /** Stored token reused because this document is a reload / bfcache restore. */
  | "reused-same-document"
  /** Stored token reused: nothing else is holding it. */
  | "reused-lease-free"
  /** Stored token was inherited by TAB DUPLICATION — re-minted. */
  | "reminted-duplicate-tab";

export interface EditSessionTokenResolution {
  token: string;
  reason: EditSessionTokenReason;
}

function isLeaseHeldByAnotherTab(env: EditSessionEnv, token: string): boolean {
  if (!env.local) return false;
  let raw: string | null = null;
  try {
    raw = env.local.getItem(editSessionLeaseKey(token));
  } catch {
    return false;
  }
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return env.now() - ts < EDIT_SESSION_LEASE_STALE_MS;
}

/**
 * Decide THIS document's edit-session token. Pure: reads storage, writes back
 * only the resolved token. Lease heartbeating is the caller's job (see
 * {@link claimEditSessionLease}).
 */
export function resolveEditSessionToken(
  env: EditSessionEnv,
): EditSessionTokenResolution {
  let stored: string | null = null;
  try {
    stored = env.session?.getItem(EDIT_SESSION_STORAGE_KEY) ?? null;
  } catch {
    stored = null;
  }

  const persist = (token: string) => {
    try {
      env.session?.setItem(EDIT_SESSION_STORAGE_KEY, token);
    } catch {
      // sessionStorage may be blocked — the in-memory token still works for
      // the life of this document.
    }
  };

  if (!stored) {
    const token = env.mintUuid();
    persist(token);
    return { token, reason: "minted-fresh" };
  }

  // Signal 1 — a reload / bfcache restore is the SAME tab. Never re-mint here:
  // this is the W1-L2 same-session adoption path.
  if (env.navigationType === "reload" || env.navigationType === "back_forward") {
    return { token: stored, reason: "reused-same-document" };
  }

  // Signal 2 — a plain `navigate` carrying an inherited token. If another
  // document still holds the claim, we are a DUPLICATE and must not share it.
  if (isLeaseHeldByAnotherTab(env, stored)) {
    const token = env.mintUuid();
    persist(token);
    return { token, reason: "reminted-duplicate-tab" };
  }

  return { token: stored, reason: "reused-lease-free" };
}

/**
 * Take this document's claim on `token`. Returns a `release` for `pagehide`.
 *
 * `claim` is idempotent and needs no timer: it is called on first use and again
 * on `pageshow` (a bfcache restore, where `pagehide` already released us).
 */
export function claimEditSessionLease(
  env: Pick<EditSessionEnv, "local" | "now">,
  token: string,
): { claim: () => void; release: () => void } {
  const key = editSessionLeaseKey(token);
  const claim = () => {
    try {
      env.local?.setItem(key, String(env.now()));
    } catch {
      // localStorage may be blocked — duplication detection degrades to
      // "reuse the token", i.e. today's behavior. Never throw on the save path.
    }
  };
  const release = () => {
    try {
      env.local?.removeItem(key);
    } catch {
      // ignore
    }
  };
  return { claim, release };
}
