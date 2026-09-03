/**
 * house-booking.ts — can a HOUSE-owned offering be booked on a slot?
 *
 * WHY A SALON'S /book PAGE IS EMPTY BY CONSTRUCTION
 * ────────────────────────────────────────────────
 * `load-book-page-offerings.ts` skips any offering without a talent:
 *
 *     if (!offering.talentProfileId) continue;
 *     // Slot booking is talent-owned only; workspace menu items never land here.
 *
 * That comment is accurate, and it is why a salon, a barber, a spa or a clinic
 * gets a blank booking page. Not broken — empty on purpose, because slot
 * booking assumed a person. A barbershop's "Fade, 30 minutes" has no talent
 * profile; it is a house service on a chair.
 *
 * The same assumption runs one level down: `resolveTalentBookingMode` REQUIRES
 * a `talentProfileId` and reads `talent_profiles` for `profile_kind`,
 * `booking_terms` and `created_by_agency_id`. A chair has none of those.
 *
 * WHY THIS LIVES IN MY FILES AND NOT IN THEIRS
 * ───────────────────────────────────────────
 * `lib/scheduling/booking-surface.ts` is the Appointments Manager's, and it
 * stays person-shaped and untouched. This module CALLS their primitives rather
 * than reimplementing them:
 *
 *   `bookingSurfaceFromHost`     the host-kind rule, theirs, reused verbatim
 *   `talentBookingModeFromPolicy` the policy-to-mode rule, theirs, reused
 *   `offeringRequestSubmitAllowed` the submit gate, theirs, reused
 *
 * So this is ONE resolver with two entry points, not two implementations. Two
 * resolvers drifting is exactly how four carts happened, and the whole reason
 * the Director approved this shape.
 *
 * THE OPEN QUESTION, STATED RATHER THAN ANSWERED
 * ─────────────────────────────────────────────
 * For a talent, "mode" answers a question about a RELATIONSHIP: what has this
 * person agreed to, and on whose host. A chair has no terms and no agency
 * relationship, so for a house offering the question collapses to two facts the
 * offering already carries: is it slot-bookable at all, and does a pool have
 * room. That is what this implements.
 *
 * It may be that a house offering eventually needs something richer (a room
 * that a specific therapist must staff, say). That is a question for the
 * Appointments Manager and it can be answered AFTER this code exists — nothing
 * here forecloses it, because the mode type and the submit gate are shared.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  bookingSurfaceFromHost,
  offeringRequestSubmitAllowed,
  type BookingSurfaceHost,
  type TalentBookingMode,
} from "@/lib/scheduling/booking-surface";
import { logServerError } from "@/lib/server/safe-error";
import type { TalentOffering } from "@/lib/talent/offerings-types";

/**
 * Does this offering belong to the house rather than to a person?
 *
 * The absence of a talent IS the definition, which is why the loader's skip was
 * an accurate description of the old behaviour rather than a bug in itself.
 */
export function isHouseOwnedOffering(
  offering: Pick<TalentOffering, "talentProfileId">,
): boolean {
  return !offering.talentProfileId;
}

/**
 * A house offering is slot-bookable when it has a duration and a capacity pool.
 *
 * BOTH are required, and the pool is the half that is new. Before Capacity 0.2
 * there was no way to say "N units of a chair over a window", so a house
 * service had nowhere to hold a booking even if the page had rendered it.
 * `capacity_pool_id` is what makes the difference between a menu item, which is
 * bought, and a service, which is booked.
 *
 * Pure, so the rule is assertable without a database.
 */
export function houseOfferingIsSlotBookable(
  offering: Pick<TalentOffering, "talentProfileId" | "capacityPoolId" | "durationMinutes">,
): boolean {
  if (!isHouseOwnedOffering(offering)) return false;
  if (!offering.capacityPoolId) return false;
  const minutes = offering.durationMinutes;
  return typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0;
}

/**
 * The booking mode for a house-owned offering.
 *
 * Deliberately NOT a second implementation of the talent rule. It reuses the
 * host-kind rule verbatim and then answers the only question a chair can
 * answer: it is bookable, or it is an enquiry.
 *
 * Returns "inquire" for anything that is not clearly bookable, which is the
 * safe direction: an enquiry always works, and offering an instant slot the
 * engine cannot hold would take a customer to a refusal.
 */
export function houseBookingModeFor(
  offering: Pick<TalentOffering, "talentProfileId" | "capacityPoolId" | "durationMinutes">,
  host: BookingSurfaceHost,
): TalentBookingMode {
  // Their rule, not a copy of it.
  if (bookingSurfaceFromHost(host.kind) === "other") return "inquire";
  return houseOfferingIsSlotBookable(offering) ? "instant" : "inquire";
}

/**
 * The house counterpart of `assertTalentReservationAllowed`.
 *
 * Uses THEIR submit gate (`offeringRequestSubmitAllowed`) so the two paths can
 * never disagree about what "bookable" permits. Async and taking a client to
 * match the talent signature, so a caller can hold one variable for either.
 */
export async function assertHouseReservationAllowed(
  _admin: SupabaseClient,
  input: {
    offering: Pick<TalentOffering, "talentProfileId" | "capacityPoolId" | "durationMinutes">;
    host: BookingSurfaceHost;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const mode = houseBookingModeFor(input.offering, input.host);
    if (!offeringRequestSubmitAllowed(mode)) {
      return { ok: false, error: "This time cannot be booked." };
    }
    return { ok: true };
  } catch (error) {
    logServerError("booking.assertHouseReservationAllowed", error);
    return { ok: false, error: "This time cannot be booked." };
  }
}
