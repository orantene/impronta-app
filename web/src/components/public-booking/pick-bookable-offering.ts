import type { TalentOffering } from "@/lib/talent/offerings-types";

export type BookableOffering = {
  offeringId: string;
  durationMinutes: number;
  timezone: string;
  locationLabel?: string | null;
  talentProfileId?: string | null;
  requireAccountToBook?: boolean;
};

/** An offering that can actually produce public slots (duration + not a product). */
export function isSlotEligibleOffering(
  o: Pick<TalentOffering, "durationMinutes" | "kind" | "bookingMode">,
): boolean {
  if (o.kind === "product") return false;
  if ((o.durationMinutes ?? 0) <= 0) return false;
  return o.bookingMode === "request" || o.bookingMode === "instant";
}

export function pickBookableOffering(
  offerings: TalentOffering[],
  opts?: { locationLabel?: string | null; timezone?: string | null },
): BookableOffering | null {
  const pick = offerings.find(isSlotEligibleOffering) ?? null;
  if (!pick) return null;
  return {
    offeringId: pick.id,
    durationMinutes: pick.durationMinutes as number,
    timezone: opts?.timezone && opts.timezone.trim() ? opts.timezone : "UTC",
    locationLabel: opts?.locationLabel ?? null,
    talentProfileId: pick.talentProfileId,
    requireAccountToBook: pick.requireAccountToBook === true,
  };
}
