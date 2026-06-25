"use client";

/**
 * useCartTalents — derive the launcher rail's AvatarStackItem[] from the LIVE
 * inquiry cart (the single source of truth, useInquiryCart().cartIds) joined
 * with a portrait/name lookup the page already has (plan §4.A.1).
 *
 * This is the ONLY place the rail's data is assembled, so there is no second
 * cart store: `cartIds` stays canonical and this hook is a pure projection of
 * it. The lookup is whatever the host can supply, in priority order at the page
 * level:
 *   1. loadTalentCardThumbs() output (rank card→hero→public_watermarked→…)
 *   2. GuestInquirySummary.talentPortraitUrl (returning-guest fallback)
 *   3. the roster name/photo the directory cards already render
 *
 * The host passes a flat `lookup` map keyed by talentProfileId. Unknown ids
 * still appear (name falls back to "Talent", portrait null → initials medallion)
 * so a freshly-added talent never vanishes from the rail while its thumb loads.
 *
 * Order: cartIds preserves add order; LauncherAvatarStack renders newest-first
 * internally, so this hook keeps cartIds order as-is.
 */

import { useMemo } from "react";

import type { AvatarStackItem } from "@/lib/inquiry/guest-chat-contract";
import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";

export type CartTalentLookupEntry = {
  displayName?: string | null;
  portraitUrl?: string | null;
};

export type CartTalentLookup =
  | Map<string, CartTalentLookupEntry>
  | Record<string, CartTalentLookupEntry>;

function readLookup(
  lookup: CartTalentLookup,
  id: string,
): CartTalentLookupEntry | undefined {
  if (lookup instanceof Map) return lookup.get(id);
  return lookup[id];
}

/**
 * @param lookup id → { displayName, portraitUrl } the page already resolved.
 * @returns AvatarStackItem[] in cart order, ready for <LauncherAvatarStack>.
 */
export function useCartTalents(lookup: CartTalentLookup): AvatarStackItem[] {
  const { cartIds } = useInquiryCart();

  // Resolve eagerly each render (cheap — a handful of ids), then memoize on a
  // signature of the RESOLVED rows. This keeps the returned array identity
  // stable until the cart or the looked-up name/portrait for an in-cart id
  // actually changes, while keeping the dependency array honest: the memo's one
  // dep, `signature`, fully captures every value `resolved` is built from, so
  // there is no unstable `lookup` identity to suppress.
  const resolved: AvatarStackItem[] = cartIds.map((id) => {
    const entry = readLookup(lookup, id);
    return {
      talentProfileId: id,
      displayName: entry?.displayName?.trim() || "Talent",
      portraitUrl: entry?.portraitUrl ?? null,
    };
  });

  const signature = resolved
    .map((r) => `${r.talentProfileId}|${r.displayName}|${r.portraitUrl ?? ""}`)
    .join("");

  return useMemo(() => resolved, [signature]);
}
