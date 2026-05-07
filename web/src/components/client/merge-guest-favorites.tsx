"use client";

// Phase 4 — canonical location (moved from (dashboard)/client/merge-guest.tsx).
// Silently merges any guest-session favorites/inquiries into the newly
// authenticated client account, then refreshes the page to reflect changes.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { mergeGuestActivity } from "@/lib/server-actions/client-guest-merge";

export function MergeGuestFavorites() {
  const ran = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void mergeGuestActivity().then(() => {
      router.refresh();
    });
  }, [router]);
  return null;
}
