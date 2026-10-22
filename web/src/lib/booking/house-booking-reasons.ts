/**
 * Pure (client-safe) half of house-booking: why a workspace service cannot be
 * booked online yet. Kept apart from `house-booking.ts` because that file pulls
 * server-side logging and the scheduling engine, which a client component must
 * not import.
 */

/**
 * The slots route (`public-open-times.ts`) answers `not_bookable_here` for any
 * offering without a provider, so house services have no online times until the
 * provider model lands (Phase 1). Flip this with that work, not before.
 */
import { isSlotEligibleOffering } from "@/components/public-booking/pick-bookable-offering";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { sellability } from "@/lib/offerings/sellable";

export const HOUSE_SLOTS_SUPPORTED = false;

export type HouseOnlineBookingReason =
  | "not_published"
  | "not_approved"
  | "not_public"
  | "is_product"
  | "inquiry_only"
  | "no_duration";

/**
 * TUL-1915: the ONE decision for "does the public site offer online booking for
 * this workspace service". The /book loader (`load-book-page-offerings.ts`) and
 * the item editor badge both call it, so the admin can never say "cannot be
 * booked" while the public page shows a Request button (or the reverse).
 *
 *  - `request`      the public page lists it and a client can send a booking
 *                   request (no times to pick: house slots are not supported).
 *  - `not_offered`  the public page does not list it, with the reason.
 *
 * Mirrors the loader's gates in order: sellability("guest_request") (published,
 * approved, public or on_request), then slot eligibility (not a product, has a
 * duration, not inquiry-only).
 */
export function houseOnlineBooking(offering: {
  talentProfileId: string | null;
  durationMinutes: number | null;
  kind: string;
  bookingMode: string | null;
  status: string;
  moderationState: string;
  visibility: string;
}): { state: "request" } | { state: "not_offered"; reason: HouseOnlineBookingReason } {
  const sold = sellability(offering, "guest_request");
  if (!sold.ok) {
    const reason: HouseOnlineBookingReason =
      sold.reason === "not_published" ? "not_published" : sold.reason === "not_approved" ? "not_approved" : "not_public";
    return { state: "not_offered", reason };
  }
  if (offering.kind === "product") return { state: "not_offered", reason: "is_product" };
  if (offering.bookingMode === "inquiry") return { state: "not_offered", reason: "inquiry_only" };
  if (!isSlotEligibleOffering({ ...offering, bookingMode: offering.bookingMode as TalentOffering["bookingMode"] }))
    return { state: "not_offered", reason: "no_duration" };
  return { state: "request" };
}

export type HouseNotBookableReason = "no_provider" | "no_duration";

/**
 * Why a house service cannot be booked online yet, or null when it can. The item
 * editor shows it as "No se puede reservar en linea todavia: ..." so the owner
 * knows the fix instead of finding an empty /book.
 */
export function houseNotBookableReason(offering: {
  talentProfileId: string | null;
  durationMinutes: number | null;
  kind: string;
  bookingMode: string | null;
}): HouseNotBookableReason | null {
  if (offering.talentProfileId) return null;
  if (offering.kind === "product" || offering.bookingMode === "inquiry") return null;
  const minutes = offering.durationMinutes;
  if (!(typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0)) return "no_duration";
  return HOUSE_SLOTS_SUPPORTED ? null : "no_provider";
}
