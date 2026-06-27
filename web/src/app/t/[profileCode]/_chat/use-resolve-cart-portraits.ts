"use client";

/**
 * useResolveCartPortraits — backfill launcher-rail portraits for cart members the
 * client registry doesn't know about (plan §4.A.1 / §5.5 remaining bug).
 *
 * WHY THIS EXISTS:
 *   The cart-talent-registry is the OPTIMISTIC instant layer: it is seeded only by
 *   in-session adds (each directory card registers its name + thumb on add). But on
 *   a COLD load the inquiry cart is restored from saved_talent, so those ids are NOT
 *   in the registry and fall back to initials on the rail. This hook closes that gap:
 *   it watches cartIds, finds the ids that have no portrait in the registry yet, and
 *   batch-resolves them once via the guest-safe resolveGuestCartPortraits action,
 *   merging results back into the registry (registerCartTalents). The cart stays the
 *   single source of membership (cartIds); the registry stays the single presentation
 *   store; this only feeds the latter for ids the former already holds.
 *
 * Batching / debounce:
 *   - One request per distinct set of MISSING ids, debounced 250ms so rapid cart
 *     changes (or a burst of restores) collapse into a single round-trip.
 *   - Ids are remembered as "attempted" only AFTER a real lookup completes (a
 *     successful round-trip), so a genuinely photo-less id is not re-fetched every
 *     render while a transient network failure leaves the id un-attempted and
 *     retryable on the next cart change.
 */

import { useEffect, useRef } from "react";

import type { ResolveGuestCartPortraitsCallback } from "@/lib/inquiry/guest-chat-contract";
import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";

import { registerCartTalents, useCartTalentRegistry } from "./cart-talent-registry";

export function useResolveCartPortraits(
  tenantSlug: string,
  onResolveCartPortraits: ResolveGuestCartPortraitsCallback | null | undefined,
): void {
  const { cartIds } = useInquiryCart();
  const registry = useCartTalentRegistry();
  // Ids we've already requested (resolved or genuinely absent) so we don't refetch
  // an id that the public roster legitimately has no photo for.
  const attempted = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ids in the cart that currently have no portrait in the registry. The
  // `attempted` ref is intentionally NOT read here — refs must not be accessed
  // during render; the already-tried filter happens inside the effect below.
  const unresolved = cartIds.filter((id) => {
    const entry = registry instanceof Map ? registry.get(id) : registry[id];
    return !entry?.portraitUrl;
  });
  const unresolvedKey = unresolved.slice().sort().join(",");

  useEffect(() => {
    if (!onResolveCartPortraits || !tenantSlug) return;
    if (unresolvedKey.length === 0) return;

    // Filter out ids we've already requested (resolved or genuinely photo-less)
    // so a transient miss is not re-fetched on every cart change.
    const ids = unresolvedKey
      .split(",")
      .filter((id) => id && !attempted.current.has(id));
    if (ids.length === 0) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void onResolveCartPortraits({ tenantSlug, talentProfileIds: ids })
        .then((res) => {
          if (res.ok && res.talents.length > 0) {
            registerCartTalents(
              res.talents.map((t) => ({
                talentProfileId: t.talentProfileId,
                displayName: t.displayName,
                portraitUrl: t.portraitUrl,
              })),
            );
          }
          // Mark attempted ONLY after a real lookup completes. The action only
          // returns ok on a successful round-trip; on ok we mark every requested
          // id tried (resolved ids leave `unresolved` anyway; genuinely photo-less
          // ids stay marked so they don't refetch every render). A failed/errored
          // call leaves the ids unmarked so a transient miss can retry next change.
          if (res.ok) {
            for (const id of ids) attempted.current.add(id);
          }
        })
        .catch(() => {
          /* Best-effort backfill — initials fallback stays; ids stay un-attempted
             so a transient network miss retries on the next cart change. */
        });
    }, 250);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [unresolvedKey, tenantSlug, onResolveCartPortraits]);
}
