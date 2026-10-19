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
export const HOUSE_SLOTS_SUPPORTED = false;

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
