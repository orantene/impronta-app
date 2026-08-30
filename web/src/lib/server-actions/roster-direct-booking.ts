"use server";

/* eslint-disable ratchet/no-untenanted-from -- agencies is the tenant-root table (keyed by id, not tenant_id); same pattern as appointments-settings-tenant. */

/**
 * Per-roster-row agency gates for public appointments.
 *
 * Two distinct columns:
 *   - direct_booking_enabled: show booking on THIS workspace's pages
 *   - external_booking_released: exclusive-primary veto release for
 *     channels outside this workspace (own page, hubs, other agencies)
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { userHasCapability } from "@/lib/access";
import { rowIsExclusive } from "@/lib/inquiry/owning-party-resolver";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { EXCLUSIVE_RELEASE_DENIED } from "@/lib/scheduling/exclusive-release-gate";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

const schema = z.object({
  talentProfileId: z.string().uuid(),
  enabled: z.boolean(),
});

type RosterGateRow = {
  id: string;
  direct_booking_enabled?: boolean;
  external_booking_released?: boolean;
  is_primary?: boolean;
  exclusivity_status?: string | null;
};

async function loadTenantPlanTier(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("agencies")
    .select("plan_tier")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("roster-direct-booking.plan", error);
    return null;
  }
  const tier = (data as { plan_tier?: string | null } | null)?.plan_tier;
  return typeof tier === "string" ? tier : null;
}

function exclusivePrimary(row: RosterGateRow, planTier: string | null): boolean {
  return rowIsExclusive(row.is_primary === true, row.exclusivity_status, {
    plan_tier: planTier,
  });
}

type LoadResult =
  | {
      ok: true;
      enabled: boolean;
      rosterRowId: string;
      exclusiveReleased: boolean;
      showExclusiveRelease: boolean;
      canRelease: boolean;
    }
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
    .select(
      "id, direct_booking_enabled, external_booking_released, is_primary, exclusivity_status",
    )
    .eq("talent_profile_id", talentProfileId)
    .in("status", ["active", "pending"])
    .maybeSingle();

  if (error) {
    logServerError("roster-direct-booking.load", error);
    return { ok: false, error: "Could not load booking setting." };
  }
  if (!data) return { ok: false, error: "Not on this roster." };

  const row = data as RosterGateRow;
  const planTier = await loadTenantPlanTier(auth.supabase, auth.tenantId);
  const canRelease = await userHasCapability("manage_agency_settings", auth.tenantId);
  return {
    ok: true,
    enabled: row.direct_booking_enabled === true,
    rosterRowId: row.id,
    exclusiveReleased: row.external_booking_released === true,
    showExclusiveRelease: exclusivePrimary(row, planTier),
    canRelease,
  };
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

type ReleaseResult =
  | { ok: true; released: boolean }
  | { ok: false; error: string };

export async function setRosterExternalBookingReleased(
  talentProfileId: string,
  released: boolean,
): Promise<ReleaseResult> {
  const auth = await requireWorkspaceStaffAction({
    capability: "manage_agency_settings",
  });
  if (!auth.ok) return { ok: false, error: EXCLUSIVE_RELEASE_DENIED };
  const parsed = schema.safeParse({ talentProfileId, enabled: released });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const { data, error: readErr } = await tenantScopedQuery(
    auth.supabase,
    "agency_talent_roster",
    auth.tenantId,
  )
    .select("id, is_primary, exclusivity_status")
    .eq("talent_profile_id", parsed.data.talentProfileId)
    .in("status", ["active", "pending"])
    .maybeSingle();
  if (readErr || !data) {
    if (readErr) logServerError("roster-direct-booking.release-read", readErr);
    return { ok: false, error: "Not on this roster." };
  }

  const row = data as RosterGateRow;
  const planTier = await loadTenantPlanTier(auth.supabase, auth.tenantId);
  if (!exclusivePrimary(row, planTier)) {
    return { ok: false, error: "This setting only applies to an exclusive primary." };
  }

  const { error } = await tenantScopedQuery(
    auth.supabase,
    "agency_talent_roster",
    auth.tenantId,
  )
    .update({
      external_booking_released: parsed.data.enabled,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", row.id);

  if (error) {
    logServerError("roster-direct-booking.release", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, released: parsed.data.enabled };
}
