/**
 * Service-role firm hold for a public reservation request.
 *
 * placeTalentHold requires workspace staff auth — guests cannot call it.
 * This module inserts the same talent_holds row as the staff path, with a
 * 48h default expiry, and maps the gist exclusion (SQLSTATE 23P01) to a
 * friendly "slot just taken" result. Staff placeTalentHold is not reused.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

export const RESERVATION_HOLD_TTL_MS = 48 * 60 * 60 * 1000;

export type PlaceReservationHoldInput = {
  talentProfileId: string;
  tenantId: string;
  inquiryId?: string | null;
  startsAt: Date | string;
  endsAt: Date | string;
  title?: string;
  expiresAt?: Date | string | null;
  createdByUserId?: string | null;
};

export type PlaceReservationHoldFailure = {
  ok: false;
  code: "slot_taken" | "invalid" | "unavailable";
  error: string;
};

export type PlaceReservationHoldSuccess = {
  ok: true;
  holdId: string;
  expiresAt: string | null;
};

export type PlaceReservationHoldResult =
  | PlaceReservationHoldSuccess
  | PlaceReservationHoldFailure;

function toIso(value: Date | string): string | null {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Postgres exclusion_violation — the firm-hold gist fired. */
export function isExclusionViolation(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "23P01") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("23p01") || msg.includes("exclusion") || msg.includes("talent_holds_firm_no_overlap");
}

export function mapHoldInsertError(
  err: { code?: string | null; message?: string | null } | null | undefined,
): PlaceReservationHoldFailure {
  if (isExclusionViolation(err)) {
    return { ok: false, code: "slot_taken", error: "That time was just taken. Pick another time." };
  }
  return { ok: false, code: "unavailable", error: "Could not hold that time. Try again." };
}

export async function placeReservationHold(
  admin: SupabaseClient,
  input: PlaceReservationHoldInput,
): Promise<PlaceReservationHoldResult> {
  const startsAt = toIso(input.startsAt);
  const endsAt = toIso(input.endsAt);
  if (!input.talentProfileId || !input.tenantId || !startsAt || !endsAt) {
    return { ok: false, code: "invalid", error: "Missing hold window." };
  }
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    return { ok: false, code: "invalid", error: "End must be after start." };
  }

  let expiresAt: string | null;
  if (input.expiresAt === null) {
    expiresAt = null;
  } else if (input.expiresAt === undefined) {
    expiresAt = new Date(Date.now() + RESERVATION_HOLD_TTL_MS).toISOString();
  } else {
    expiresAt = toIso(input.expiresAt);
    if (!expiresAt) return { ok: false, code: "invalid", error: "Invalid hold expiry." };
  }

  const { data, error } = await admin
    .from("talent_holds")
    .insert({
      talent_profile_id: input.talentProfileId,
      tenant_id: input.tenantId,
      inquiry_id: input.inquiryId ?? null,
      title: (input.title ?? "Reservation").trim() || "Reservation",
      starts_at: startsAt,
      ends_at: endsAt,
      all_day: false,
      hold_strength: "firm",
      expires_at: expiresAt,
      created_by_user_id: input.createdByUserId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (!isExclusionViolation(error)) {
      logServerError("reservation-hold/insert", error);
    }
    return mapHoldInsertError(error);
  }
  return { ok: true, holdId: data.id as string, expiresAt };
}

export async function releaseReservationHold(
  admin: SupabaseClient,
  holdId: string,
): Promise<{ ok: true } | PlaceReservationHoldFailure> {
  if (!holdId) return { ok: false, code: "invalid", error: "Missing hold." };
  const { error } = await admin.from("talent_holds").delete().eq("id", holdId);
  if (error) {
    logServerError("reservation-hold/release", error);
    return { ok: false, code: "unavailable", error: "Could not release hold." };
  }
  return { ok: true };
}

export async function attachReservationHoldToInquiry(
  admin: SupabaseClient,
  holdId: string,
  inquiryId: string,
): Promise<{ ok: true } | PlaceReservationHoldFailure> {
  if (!holdId || !inquiryId) return { ok: false, code: "invalid", error: "Missing hold or inquiry." };
  const { error } = await admin
    .from("talent_holds")
    .update({ inquiry_id: inquiryId })
    .eq("id", holdId);
  if (error) {
    logServerError("reservation-hold/attach", error);
    return { ok: false, code: "unavailable", error: "Could not attach hold." };
  }
  return { ok: true };
}

export async function releaseHoldsForInquiry(
  admin: SupabaseClient,
  inquiryId: string,
): Promise<{ ok: true; released: number } | PlaceReservationHoldFailure> {
  if (!inquiryId) return { ok: false, code: "invalid", error: "Missing inquiry." };
  const { data, error } = await admin
    .from("talent_holds")
    .delete()
    .eq("inquiry_id", inquiryId)
    .select("id");
  if (error) {
    logServerError("reservation-hold/release_inquiry", error);
    return { ok: false, code: "unavailable", error: "Could not release hold." };
  }
  return { ok: true, released: (data ?? []).length };
}
