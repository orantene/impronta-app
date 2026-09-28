import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import { loadTalentSiteSwitches } from "./site-switches.server";

function ilikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
}

/**
 * WSF D, report §8 "On/Off/On": when a talent is not taking inquiries, a new
 * guest thread may start only for an email that already has an inquiry /
 * booking with her. Returns true when the start is allowed.
 *
 * Fails OPEN on a read error (same posture as the trust gate): an infra blip
 * must never block a real existing client. A clean "no rows" refuses.
 */
export async function talentAllowsNewGuestThread(
  admin: SupabaseClient,
  talentProfileId: string,
  email: string,
  /** The draft being promoted: its own seat is not "an existing booking". */
  excludeInquiryId: string | null = null,
): Promise<boolean> {
  const switches = await loadTalentSiteSwitches(admin, talentProfileId);
  if (switches.acceptingInquiries) return true;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const { data: rows, error } = await admin
    .from("inquiries")
    .select("id")
    .ilike("contact_email", ilikeExact(normalized))
    .limit(200);
  if (error) {
    logServerError("talent.existingClient.inquiries", error);
    return true;
  }
  const ids = ((rows ?? []) as { id: string }[])
    .map((r) => r.id)
    .filter((id) => id !== excludeInquiryId);
  if (ids.length === 0) return false;

  const { data: seats, error: seatErr } = await admin
    .from("inquiry_participants")
    .select("inquiry_id")
    .eq("talent_profile_id", talentProfileId)
    .in("inquiry_id", ids)
    .limit(1);
  if (seatErr) {
    logServerError("talent.existingClient.participants", seatErr);
    return true;
  }
  return (seats ?? []).length > 0;
}

/**
 * First real send of an early draft (chip-add path): the draft was created
 * before any email was known, so the §8 gate runs here instead.
 */
export async function draftFirstSendAllowed(
  admin: SupabaseClient,
  inquiryId: string,
  email: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("inquiry_participants")
    .select("talent_profile_id")
    .eq("inquiry_id", inquiryId)
    .not("talent_profile_id", "is", null)
    .limit(5);
  if (error) {
    logServerError("talent.existingClient.draftSeats", error);
    return true;
  }
  for (const row of (data ?? []) as { talent_profile_id: string }[]) {
    if (!(await talentAllowsNewGuestThread(admin, row.talent_profile_id, email, inquiryId))) {
      return false;
    }
  }
  return true;
}
