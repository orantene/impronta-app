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
 * After success, we also clear the localStorage key + rehydrate state
 * so the bookmark badge shows the merged count.
 */
export function MergeGuestFavorites() {
  const ran = useRef(false);
  const router = useRouter();
  const discovery = usePublicDiscoveryStateOptional();

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Read localStorage favorites BEFORE calling the server action;
    // they'll be cleared after merge.
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

    void mergeGuestActivity(guestFavoriteIds).then(() => {
      // Clear the localStorage favorites — they now live in
      // `client_favorites` and will be reloaded from the SSR seed on
      // the next render.
      if (guestFavoriteIds.length > 0) {
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
    });
  }, [discovery, router]);
  return null;
}
