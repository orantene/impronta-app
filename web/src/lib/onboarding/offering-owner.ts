/**
 * TUL-77b · who owns the services onboarding creates.
 *
 * A SOLO owner (one workspace, the owner is its only active roster provider)
 * sells through their own calendar: the services are the owner-provider's
 * (`talent_profile_id` = the owner), so /book, the slots route and instant
 * confirm use the existing talent path and `talent_booking_hours`. A house
 * offering (`talent_profile_id` null) needs a capacity pool, which a fresh
 * business site does not have, so /book dropped it.
 *
 * Pure: the caller reads the owner's talent profile and the roster count.
 */

import type { OnboardingChoice } from "./choice";

export type OfferingOwnerInput = {
  choice: OnboardingChoice;
  /** The owner's own talent profile, or null when they have none. */
  ownerTalentProfileId: string | null;
  /**
   * Active roster providers of the workspace, counting the owner, plus any
   * provider being invited. 0 when the owner is not on the roster.
   */
  providerCount: number;
};

/** The `talent_profile_id` to write on new offerings; null = house-owned. */
export function offeringOwnerFor(input: OfferingOwnerInput): string | null {
  const id = input.ownerTalentProfileId;
  if (!id) return null;
  // "myself" and "both" already write the person's own offerings.
  if (input.choice !== "studio") return id;
  // A studio is solo only while the owner is its single provider.
  return input.providerCount === 1 ? id : null;
}
