"use client";

// Phase 4 — canonical location (moved from (dashboard)/client/merge-guest.tsx).
// Silently merges any guest-session favorites/inquiries into the newly
// authenticated client account, then refreshes the page to reflect changes.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { usePublicDiscoveryStateOptional } from "@/components/directory/public-discovery-state";
import { mergeGuestActivity } from "@/lib/server-actions/client-guest-merge";

const FAVORITE_IDS_KEY = "impronta.public.favorite-ids";

function readGuestFavoriteIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITE_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

/**
 * Runs once on first authed render of any public page that mounts this
 * component. Three sweeps in `mergeGuestActivity`:
 *
 *   1. Inquiry cart (`saved_talent` guest rows → client)
 *   2. Inquiries (guest_session_id → client_user_id)
 *   3. Personal favorites (localStorage → `client_favorites`)
 *
 * Step 3 needs the IDs read CLIENT-side before the server action runs.
 *
 * WHY the render-phase capture (Lane A / A3): `DiscoveryStateBridge` is a
 * JSX sibling that appears BEFORE this component in the public layout.
 * React fires sibling effects in JSX order, so `hydrateFavoriteIds([])`
 * runs first and overwrites FAVORITE_IDS_KEY with the server's (initially
 * empty) list. Capturing here — synchronously in the render phase, before
 * any effects — preserves the guest IDs across that race.
 *
 * WHY we diff against serverFavoriteIds (Lane A / A3): localStorage may
 * contain IDs that DiscoveryStateBridge wrote on a previous authed visit.
 * Those are already in `client_favorites` and must not be treated as
 * guest saves (which would cause a spurious clearFavoriteIds() flash on
 * every page load for a returning authed user).
 *
 * Hardening (Lane G / G2): the guest localStorage key is cleared ONLY
 * after the server confirms the merge landed (`result.ok`). A transient
 * failure used to clear the key unconditionally, silently destroying the
 * visitor's saved favorites. On failure the key is left intact, so the
 * next authed navigation (a fresh component instance, fresh `ran` guard)
 * retries the merge — the sweep is self-healing.
 *
 * Integration note (Lane E): A3 and G2 independently rewrote this file.
 * This is the merged resolution — A's render-phase race fix kept whole,
 * with G's result.ok-gated clear folded into the merge callback. Both
 * lane agents should sanity-check.
 */
export function MergeGuestFavorites({
  serverFavoriteIds,
}: {
  serverFavoriteIds: string[];
}) {
  const ran = useRef(false);
  const router = useRouter();
  const discovery = usePublicDiscoveryStateOptional();

  // Read localStorage synchronously during the render phase (before any
  // effects) and subtract IDs already present on the server — those were
  // seeded by a prior authed visit, not by the current guest session.
  const capturedGuestIds = useRef<string[] | null>(null);
  if (capturedGuestIds.current === null) {
    const raw = readGuestFavoriteIds();
    const serverSet = new Set(serverFavoriteIds);
    capturedGuestIds.current = raw.filter((id) => !serverSet.has(id));
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const guestFavoriteIds = capturedGuestIds.current ?? [];

    void mergeGuestActivity(guestFavoriteIds)
      .then((result) => {
        // Only clear the guest favorites once the server confirms the
        // upsert into `client_favorites` succeeded — otherwise a failed
        // merge would lose them. On failure, leave the key for a retry.
        if (result.ok && guestFavoriteIds.length > 0) {
          try {
            window.localStorage.setItem(FAVORITE_IDS_KEY, JSON.stringify([]));
          } catch {
            /* ignore */
          }
          if (discovery) {
            discovery.clearFavoriteIds();
          }
        }
        router.refresh();
      })
      .catch(() => {
        // Network/unexpected error — keep localStorage intact so a later
        // authed navigation re-attempts the merge.
        router.refresh();
      });
  }, [discovery, router]);
  return null;
}
