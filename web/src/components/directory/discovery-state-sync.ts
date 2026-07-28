"use client";

/**
 * Cross-tree sync for the public discovery state (lineup + favorites).
 *
 * THE BUG THIS FIXES
 * The quick-open profile modal renders in the root layout's `@modal` parallel
 * slot, which is a SIBLING of `{children}` — so it sits outside the (public)
 * layout's `PublicDiscoveryStateProvider`. A second provider is mounted for
 * the modal branch, and the two held independent React state. Adding a talent
 * to your lineup inside the modal left the directory cards' "In lineup" badge
 * and the launcher count stale until a hard reload — on the single most
 * important interaction we ship.
 *
 * WHY NOT HOIST ONE PROVIDER TO THE ROOT LAYOUT
 * The root layout also wraps workspace, admin, auth and marketing routes. A
 * public discovery provider there would be the wrong scope and would force
 * public-context resolution (SSR seeds for saved/favorite ids) on every
 * route. Two provider instances are legitimate; they just need one truth.
 *
 * HOW
 * localStorage is already the canonical mirror. Every mutation now writes it
 * AND broadcasts a snapshot; every provider instance adopts the snapshot
 * AUTHORITATIVELY (replace, never union — a union can't express a removal,
 * which is exactly why the previous mount-time merge could not fix this).
 * The `storage` event gives cross-TAB sync for free.
 *
 * Framework-free and side-effect-free at import time so it is unit-testable.
 */

/* Canonical storage keys — these EXACT strings are pre-existing and hold live
   visitor data; changing them would silently orphan every saved lineup. */
export const SAVED_IDS_KEY = "impronta.public.saved-ids";
export const FAVORITE_IDS_KEY = "impronta.public.favorite-ids";

/** Same-document broadcast channel. `storage` only fires in OTHER tabs. */
const EVENT = "tulala:discovery-state";

export type DiscoveryKey = typeof SAVED_IDS_KEY | typeof FAVORITE_IDS_KEY;

export type DiscoverySnapshot = { key: DiscoveryKey; ids: string[] };

/**
 * Persist + broadcast in one step. Returns the normalized list so callers can
 * use it as React state without re-deriving it.
 */
export function writeAndBroadcast(key: DiscoveryKey, ids: string[]): string[] {
  const next = Array.from(new Set(ids));
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Storage blocked (private mode / quota). The broadcast below still keeps
    // every provider in this document consistent for the session.
  }
  try {
    window.dispatchEvent(
      new CustomEvent<DiscoverySnapshot>(EVENT, { detail: { key, ids: next } }),
    );
  } catch {
    // CustomEvent unavailable (very old browser) — degrade to previous
    // behavior: this tree updates, the sibling tree reconciles on next load.
  }
  return next;
}

/**
 * Subscribe to snapshots from any provider instance in this document, plus
 * changes made in other tabs. Returns an unsubscribe function.
 */
export function subscribeDiscoveryState(
  onSnapshot: (snapshot: DiscoverySnapshot) => void,
): () => void {
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<DiscoverySnapshot>).detail;
    if (!detail || !Array.isArray(detail.ids)) return;
    onSnapshot(detail);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== SAVED_IDS_KEY && event.key !== FAVORITE_IDS_KEY) return;
    onSnapshot({
      key: event.key as DiscoveryKey,
      ids: parseIdList(event.newValue),
    });
  };

  window.addEventListener(EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

/** Tolerant parse — a corrupt value must never crash the directory. */
export function parseIdList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

/** Order-sensitive equality — used to skip no-op re-renders. */
export function sameIdList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
