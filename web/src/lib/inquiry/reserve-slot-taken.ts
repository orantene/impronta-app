/**
 * Reserve drawer: a taken slot never becomes an inquiry, and the guest gets the
 * next free times (same helper the guest chat reserve intent uses:
 * `nextFreeTimesForTalent`). Pure over injected lookups so it is testable.
 */

import { parseReservationStamp } from "@/lib/scheduling/reservation-intent";

export type SlotTakenState = {
  kind: "slot_taken";
  message: string;
  /** ISO starts, at most 3, chronological. May be empty. */
  nextFreeTimes: string[];
  timezone: string;
  durationMinutes: number;
};

export type SlotTakenDeps = {
  talentIdForOffering: (offeringId: string) => Promise<string | null>;
  nextFreeTimes: (
    talentProfileId: string,
    near?: { startsAt: string; timeZone?: string },
  ) => Promise<string[]>;
};

export async function buildSlotTakenState(
  deps: SlotTakenDeps,
  sourceContext: unknown,
  message: string | undefined,
): Promise<SlotTakenState> {
  const stamp = parseReservationStamp(sourceContext);
  let nextFreeTimes: string[] = [];
  if (stamp) {
    try {
      const talentId = await deps.talentIdForOffering(stamp.offering_id);
      if (talentId) {
        const times = await deps.nextFreeTimes(talentId, { startsAt: stamp.starts_at, timeZone: stamp.timezone });
        nextFreeTimes = times.filter((s) => s !== stamp.starts_at).slice(0, 3);
      }
    } catch {
      nextFreeTimes = [];
    }
  }
  return {
    kind: "slot_taken",
    message: message ?? "That time was just taken. Pick another time.",
    nextFreeTimes,
    timezone: stamp?.timezone ?? "UTC",
    durationMinutes: stamp?.duration_minutes ?? 60,
  };
}

/** End instant for a re-selected chip. */
export function endForStart(startIso: string, durationMinutes: number): string {
  return new Date(Date.parse(startIso) + durationMinutes * 60_000).toISOString();
}

/** Copy keys for the sent state: a solo talent never gets coordinator wording. */
export function sentCopyKeys(soloTalentName: string | null | undefined): {
  solo: boolean;
  lead: string;
  body: string;
  footer: string;
} {
  const solo = Boolean(soloTalentName && soloTalentName.trim());
  return solo
    ? {
        solo,
        lead: "public.inquiryDrawer.soloLeadSent",
        body: "public.inquiryDrawer.soloSubmittedBody",
        footer: "public.inquiryDrawer.soloFooterSent",
      }
    : {
        solo,
        lead: "public.inquiryDrawer.leadSent",
        body: "public.inquiryDrawer.submittedBody",
        footer: "public.inquiryDrawer.footerSent",
      };
}
