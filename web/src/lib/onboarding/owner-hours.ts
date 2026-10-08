/**
 * #178 / TUL-77 · the solo business owner is the provider, so /book and the
 * slots route read THEIR `talent_booking_hours`, not the workspace opening
 * hours. Pure helpers for deciding when onboarding also writes those hours.
 */

/** True only while the owner is the single provider (counting a pending invite). */
export function isSoleOwnerProvider(
  owner: { talentProfileId: string; providerCount: number } | null,
  pendingInvite: boolean,
): boolean {
  if (!owner) return false;
  return owner.providerCount + (pendingInvite ? 1 : 0) === 1;
}

/** A `talent_booking_hours.weekly` value with at least one open range on any day. */
export function weeklyHasOpenDay(weekly: unknown): boolean {
  if (!weekly || typeof weekly !== "object" || Array.isArray(weekly)) return false;
  return Object.values(weekly as Record<string, unknown>).some((d) => Array.isArray(d) && d.length > 0);
}
