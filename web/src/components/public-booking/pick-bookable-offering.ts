import type { TalentOffering } from "@/lib/talent/offerings-types";

export type BookableOffering = {
  offeringId: string;
  durationMinutes: number;
  timezone: string;
  locationLabel?: string | null;
  talentProfileId?: string | null;
};

export function pickBookableOffering(
  offerings: TalentOffering[],
  opts?: { locationLabel?: string | null; timezone?: string | null },
): BookableOffering | null {
  const pick =
    offerings.find((o) => (o.durationMinutes ?? 0) > 0) ?? offerings[0] ?? null;
  if (!pick) return null;
  return {
    offeringId: pick.id,
    durationMinutes: pick.durationMinutes && pick.durationMinutes > 0 ? pick.durationMinutes : 30,
    timezone: opts?.timezone && opts.timezone.trim() ? opts.timezone : "UTC",
    locationLabel: opts?.locationLabel ?? null,
    talentProfileId: pick.talentProfileId,
  };
}
