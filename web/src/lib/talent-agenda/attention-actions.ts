/**
 * Talent-scoped attention CTAs (Wave 1 honesty).
 * Typed { ok, reason }. Idempotent where possible.
 */

"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { completeBooking, markBookingNoShow } from "./booking-actions";

export type AttentionActionResult =
  | { ok: true; already?: boolean }
  | { ok: false; reason: string };

async function ownTalentProfileId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  return typeof data?.id === "string" ? data.id : null;
}

/** Release a hold the signed-in talent owns. */
export async function releaseOwnTalentHold(holdId: string): Promise<AttentionActionResult> {
  if (!holdId) return { ok: false, reason: "missing" };
  const talentId = await ownTalentProfileId();
  if (!talentId) return { ok: false, reason: "unauthorized" };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, reason: "unavailable" };

  const { data: row, error } = await supabase
    .from("talent_holds")
    .select("id, talent_profile_id")
    .eq("id", holdId)
    .maybeSingle();
  if (error) {
    logServerError("agenda.releaseOwnHold.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!row) return { ok: false, reason: "not_found" };
  if (row.talent_profile_id !== talentId) return { ok: false, reason: "unauthorized" };

  const { error: delErr } = await supabase.from("talent_holds").delete().eq("id", holdId);
  if (delErr) {
    // RLS may block talent delete — fall back to service role after ownership check.
    const admin = createServiceRoleClient();
    if (!admin) {
      logServerError("agenda.releaseOwnHold.delete", delErr);
      return { ok: false, reason: "unavailable" };
    }
    const { error: adminErr } = await admin
      .from("talent_holds")
      .delete()
      .eq("id", holdId)
      .eq("talent_profile_id", talentId);
    if (adminErr) {
      logServerError("agenda.releaseOwnHold.adminDelete", adminErr);
      return { ok: false, reason: "unavailable" };
    }
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Complete a booking the talent is on (agency_bookings id). */
export async function completeOwnAgendaBooking(bookingId: string): Promise<AttentionActionResult> {
  if (!bookingId) return { ok: false, reason: "missing" };
  const talentId = await ownTalentProfileId();
  if (!talentId) return { ok: false, reason: "unauthorized" };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: leg } = await admin
    .from("booking_talent")
    .select("booking_id")
    .eq("booking_id", bookingId)
    .eq("talent_profile_id", talentId)
    .maybeSingle();
  if (!leg) {
    // Direct talent_bookings mirror id may equal agency id in some paths.
    const { data: tb } = await admin
      .from("talent_bookings")
      .select("id")
      .eq("id", bookingId)
      .eq("talent_profile_id", talentId)
      .maybeSingle();
    if (!tb) return { ok: false, reason: "unauthorized" };
  }

  const result = await completeBooking({ bookingId });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Mark no-show when start is in the past. */
export async function markOwnAgendaNoShow(bookingId: string): Promise<AttentionActionResult> {
  if (!bookingId) return { ok: false, reason: "missing" };
  const talentId = await ownTalentProfileId();
  if (!talentId) return { ok: false, reason: "unauthorized" };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };
  const { data: leg } = await admin
    .from("booking_talent")
    .select("booking_id")
    .eq("booking_id", bookingId)
    .eq("talent_profile_id", talentId)
    .maybeSingle();
  if (!leg) return { ok: false, reason: "unauthorized" };

  const result = await markBookingNoShow({ bookingId });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
