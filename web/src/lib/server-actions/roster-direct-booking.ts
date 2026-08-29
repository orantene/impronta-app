"use server";

/**
 * Per-roster-row agency gate for public appointments.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

const schema = z.object({
  talentProfileId: z.string().uuid(),
  enabled: z.boolean(),
});

type LoadResult =
  | { ok: true; enabled: boolean; rosterRowId: string }
  | { ok: false; error: string };

export async function loadRosterDirectBooking(talentProfileId: string): Promise<LoadResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!z.string().uuid().safeParse(talentProfileId).success) {
    return { ok: false, error: "Invalid talent." };
  }

  const { data, error } = await tenantScopedQuery(
    auth.supabase,
    "agency_talent_roster",
    auth.tenantId,
  )
    .select("id, direct_booking_enabled")
    .eq("talent_profile_id", talentProfileId)
    .in("status", ["active", "pending"])
    .maybeSingle();

  if (error) {
    logServerError("roster-direct-booking.load", error);
    return { ok: false, error: "Could not load booking setting." };
  }
  if (!data) return { ok: false, error: "Not on this roster." };

  const row = data as { id: string; direct_booking_enabled?: boolean };
  return { ok: true, enabled: row.direct_booking_enabled === true, rosterRowId: row.id };
}

type SetResult = { ok: true; enabled: boolean } | { ok: false; error: string };

export async function setRosterDirectBooking(
  talentProfileId: string,
  enabled: boolean,
): Promise<SetResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = schema.safeParse({ talentProfileId, enabled });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const { data: row, error: readErr } = await tenantScopedQuery(
    auth.supabase,
    "agency_talent_roster",
    auth.tenantId,
  )
    .select("id")
    .eq("talent_profile_id", parsed.data.talentProfileId)
    .in("status", ["active", "pending"])
    .maybeSingle();
  if (readErr || !row) {
    if (readErr) logServerError("roster-direct-booking.read", readErr);
    return { ok: false, error: "Not on this roster." };
  }

  const { error } = await tenantScopedQuery(
    auth.supabase,
    "agency_talent_roster",
    auth.tenantId,
  )
    .update({
      direct_booking_enabled: parsed.data.enabled,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", (row as { id: string }).id);

  if (error) {
    logServerError("roster-direct-booking.set", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, enabled: parsed.data.enabled };
}
