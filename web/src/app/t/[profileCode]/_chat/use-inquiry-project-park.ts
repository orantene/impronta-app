"use client";

/**
 * useInquiryProjectPark — Phase 5 (multi-inquiry PROJECTS model) park primitive.
 *
 * A client can run several inquiries at once. Starting a SEPARATE inquiry must
 * never overwrite the one in progress: the current working lineup is PARKED onto
 * its own inquiry row first, and only then is the local cart cleared and re-seeded
 * with the new selection. Nothing is lost — the parked talents live on the inquiry
 * record, so the thread-switcher re-enters that project later.
 *
 * PATCH-THEN-CLEAR ordering (the Phase 6 clearSavedIds guard, honored exactly):
 *   1. Ensure the CURRENT draft inquiry row exists (ensureGuestChatInquiry).
 *   2. Write the current lineup onto it via captureGuestChip(kind:"talent") and
 *      AWAIT the server success. This is the park.
 *   3. ONLY on park success: clearSavedIds() to wipe the local lineup mirror,
 *      then seed the new lineup (setInCart) — the new project starts clean.
 *   4. Ensure a fresh inquiry row for the NEW lineup (so it is a distinct
 *      project, not a continuation of the parked one).
 *
 * A failed park (no row / write error) NEVER reaches clearSavedIds — the lineup
 * stays in the cart, fully recoverable, and the caller is told it failed.
 *
 * Boundaries: consumes the injected guest-safe actions (captureGuestChip /
 * ensureGuestChatInquiry) — imports NO backend module, NO inquiry-permissions, NO
 * favorites, NO submit engine. Reuses the cart + the discovery park primitive as
 * the single source of lineup membership.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { usePublicDiscoveryStateOptional } from "@/components/directory/public-discovery-state";
import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";
import type { TalentCardRef } from "@/lib/talent-cards/contracts";
import type {
  CaptureGuestChipCallback,
  EnsureGuestChatInquiryCallback,
} from "@/lib/inquiry/guest-chat-contract";

export type ProjectParkContext = {
  /** Tenant slug — scopes the ensure/seed calls. */
  tenantSlug: string;
  /** Talent profile the panel is hosted on (when on a profile page), else null. */
  talentProfileId?: string | null;
  talentProfileCode?: string | null;
  /** Attribution page for the new row. */
  sourcePage: string;
  /** The id of the CURRENT draft inquiry, if already resolved by the panel. */
  currentInquiryId?: string | null;
  /** Injected guest-safe actions (the hook imports no backend module). */
  onCaptureChip: CaptureGuestChipCallback;
  ensureInquiry: EnsureGuestChatInquiryCallback;
};

export type StartSeparateInquiryInput = {
  /** The talent to seed the NEW (separate) inquiry with. */
  talent: TalentCardRef;
  /** The new talent's first name — used only for the seed system note / display. */
  firstName?: string | null;
};

export type ProjectParkResult = {
  /** True once the park + clear + re-seed all succeeded. */
  ok: boolean;
  /** Present on failure — a stable reason the UI can branch copy on. */
  reason?: "park_failed" | "no_current_lineup" | "ensure_failed";
};

export type UseInquiryProjectParkResult = {
  /**
   * Park the current lineup onto its draft row, then start a SEPARATE inquiry
   * seeded with just the given talent. Resolves with ok=false (and the lineup
   * left intact) if the park could not be persisted.
   */
  startSeparateInquiry: (input: StartSeparateInquiryInput) => Promise<ProjectParkResult>;
  /** True while a park is in flight (the picker disables its actions). */
  parking: boolean;
};

export function useInquiryProjectPark(ctx: ProjectParkContext): UseInquiryProjectParkResult {
  const discovery = usePublicDiscoveryStateOptional();
  const { cartIds, setInCart } = useInquiryCart();
  const [parking, setParking] = useState(false);

  // Keep the latest context + cart in refs so the awaited park reads current
  // values even if it spans renders. Synced in an effect (never written during
  // render) to satisfy the react-hooks/refs ratchet.
  const ctxRef = useRef(ctx);
  const cartRef = useRef<readonly string[]>(cartIds);
  useEffect(() => {
    ctxRef.current = ctx;
    cartRef.current = cartIds;
  }, [ctx, cartIds]);

  const startSeparateInquiry = useCallback(
    async (input: StartSeparateInquiryInput): Promise<ProjectParkResult> => {
      const c = ctxRef.current;
      const currentLineup = [...cartRef.current];

      setParking(true);
      try {
        // ── 1 + 2. PARK: persist the current lineup onto its OWN inquiry row ──
        // Skip the park when there is nothing to preserve (empty lineup) — there
        // is no project to lose, so we go straight to seeding the new one.
        if (currentLineup.length > 0) {
          // Resolve the current draft row (use the panel's id when known, else
          // lazily ensure one so the park has a destination).
          let parkInquiryId = c.currentInquiryId ?? null;
          if (!parkInquiryId) {
            const ensured = await c.ensureInquiry({
              tenantSlug: c.tenantSlug,
              talentProfileId: c.talentProfileId ?? null,
              talentProfileCode: c.talentProfileCode ?? null,
              sourcePage: c.sourcePage,
            });
            if (!ensured.ok) {
              return { ok: false, reason: "ensure_failed" };
            }
            parkInquiryId = ensured.inquiryId;
          }

          // Write the lineup onto the parked row — AWAIT success before any clear.
          const parked = await c.onCaptureChip({
            inquiryId: parkInquiryId,
            kind: "talent",
            value: {
              selectedIds: currentLineup,
              selectionMode: "i_know_who",
            },
          });
          if (!parked.ok) {
            // Park failed — the lineup stays in the cart, nothing is cleared.
            return { ok: false, reason: "park_failed" };
          }
        }

        // ── 3. CLEAR (only after a successful park) — PATCH-THEN-CLEAR ────────
        // The Phase 6 guard requires the server park to land BEFORE this wipe.
        discovery?.clearSavedIds();

        // ── 4. SEED the NEW lineup with just the chosen talent ────────────────
        setInCart(input.talent, true, c.sourcePage);

        // Ensure a FRESH inquiry row for the new lineup so it is a distinct
        // project, not a continuation of the parked one. Best-effort: the panel
        // also lazily ensures on the first structured commit, so a failure here
        // does not lose the seeded cart.
        //
        // forceNew:true is REQUIRED here (W0-B): the draft we just parked is
        // still live, and ensureGuestChatInquiry now reuses an existing live
        // draft rather than inserting (W0-A). Without forceNew we would get the
        // parked draft back and the new project's chip writes could overwrite
        // the parked lineup. This is the ONLY call site that mints a separate
        // project, so it is the only one that sets forceNew.
        await c.ensureInquiry({
          tenantSlug: c.tenantSlug,
          talentProfileId: input.talent.talentProfileId,
          talentProfileCode: c.talentProfileCode ?? null,
          sourcePage: c.sourcePage,
          forceNew: true,
        });

        return { ok: true };
      } finally {
        setParking(false);
      }
    },
    [discovery, setInCart],
  );

  return { startSeparateInquiry, parking };
}
