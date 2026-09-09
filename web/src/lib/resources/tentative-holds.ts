/**
 * Tentative staff holds — firm holds with expiry, never soft.
 *
 * Soft holds overlap by design. A "tentative" that does not block is a lie.
 * These are firm-with-expiry plus owner/reason metadata on the title/notes
 * convention until a dedicated column ships.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  placeReservationHold,
  releaseReservationHold,
  type PlaceReservationHoldResult,
} from "@/lib/scheduling/reservation-hold";

export type TentativeHoldInput = {
  talentProfileId: string;
  tenantId: string;
  startsAt: string;
  endsAt: string;
  ownerUserId: string;
  reason: string;
  /** Seconds until the hold lapses. Required — tentative without expiry is firm forever. */
  ttlSeconds: number;
  inquiryId?: string | null;
};

export type ManagerOverrideInput = TentativeHoldInput & {
  overrideReason: string;
};

function titleFor(reason: string, ownerUserId: string): string {
  const clean = reason.trim().slice(0, 120) || "Tentative hold";
  return `Tentative · ${clean} · by:${ownerUserId.slice(0, 8)}`;
}

export async function placeTentativeStaffHold(
  admin: SupabaseClient,
  input: TentativeHoldInput,
): Promise<PlaceReservationHoldResult> {
  if (!input.reason.trim()) {
    return { ok: false, code: "invalid", error: "A tentative hold needs a reason." };
  }
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 60) {
    return { ok: false, code: "invalid", error: "Tentative holds need an expiry of at least one minute." };
  }
  return placeReservationHold(admin, {
    talentProfileId: input.talentProfileId,
    tenantId: input.tenantId,
    inquiryId: input.inquiryId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    title: titleFor(input.reason, input.ownerUserId),
    ttlSeconds: input.ttlSeconds,
    createdByUserId: input.ownerUserId,
  });
}

/**
 * Manager override still places a FIRM hold — recorded with the override
 * reason so the calendar audit is honest.
 */
export async function placeManagerOverrideHold(
  admin: SupabaseClient,
  input: ManagerOverrideInput,
): Promise<PlaceReservationHoldResult> {
  if (!input.overrideReason.trim()) {
    return { ok: false, code: "invalid", error: "Override needs a reason." };
  }
  return placeReservationHold(admin, {
    talentProfileId: input.talentProfileId,
    tenantId: input.tenantId,
    inquiryId: input.inquiryId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    title: `Override · ${input.overrideReason.trim().slice(0, 120)} · by:${input.ownerUserId.slice(0, 8)}`,
    ttlSeconds: input.ttlSeconds,
    createdByUserId: input.ownerUserId,
  });
}

export { releaseReservationHold };
