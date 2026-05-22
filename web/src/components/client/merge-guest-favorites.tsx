"use client";

// Phase 4 — canonical location (moved from (dashboard)/client/merge-guest.tsx).
// Silently merges any guest-session favorites/inquiries into the newly
// authenticated client account, then refreshes the page to reflect changes.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { usePublicDiscoveryStateOptional } from "@/components/directory/public-discovery-state";
import { mergeGuestActivity } from "@/lib/server-actions/client-guest-merge";

const FAVORITE_IDS_KEY = "impronta.public.favorite-ids";

/**
 * Runs once on first authed render of any public page that mounts this
 * component. Three sweeps in `mergeGuestActivity`:
 *
 *   1. Inquiry cart (`saved_talent` guest rows → client)
 *   2. Inquiries (guest_session_id → client_user_id)
 *   3. Personal favorites (localStorage → `client_favorites`)
 *
 * Step 3 needs the IDs to be read CLIENT-side first (server can't see
 * localStorage); we pass them to the server action as an argument.
 *
 * Hardening (Lane G / G2): the guest localStorage key is cleared ONLY
 * after the server confirms the merge landed (`result.ok`). A transient
 * failure used to clear the key unconditionally, silently destroying the
 * visitor's saved favorites. On failure the key is left intact, so the
 * next authed navigation (a fresh component instance, fresh `ran` guard)
 * retries the merge — the sweep is self-healing.
 */
export function MergeGuestFavorites() {
  const ran = useRef(false);
  const router = useRouter();
  const discovery = usePublicDiscoveryStateOptional();

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Read localStorage favorites BEFORE calling the server action.
    let guestFavoriteIds: string[] = [];
    try {
      const raw = window.localStorage.getItem(FAVORITE_IDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          guestFavoriteIds = parsed.filter(
            (x): x is string => typeof x === "string" && x.length > 0,
          );
        }
      }
    } catch {
      guestFavoriteIds = [];
    }

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
