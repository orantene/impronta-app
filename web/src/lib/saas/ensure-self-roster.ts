/**
 * Own-studio glue: a talent who owns a workspace must appear on that
 * workspace's roster as active + site_visible, never is_primary.
 *
 * is_primary is exclusive representation (global-unique). A self-owned
 * studio is a channel, not a claim of exclusive agency representation.
 *
 * agency_visibility:
 *   - missing row → insert site_visible
 *   - roster_only on a self-owned row → upgrade to site_visible (the
 *     historical self-link landing)
 *   - site_visible / featured → leave (never flip an agency-authored
 *     public visibility)
 *
 * direct_booking_enabled is set true on insert/upgrade so enabling
 * appointments + the labor switch is enough to book the owner on their
 * own site, without flipping the workspace-wide allowTalentDirectBooking
 * (which would open the whole roster).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

export type SelfRosterRow = {
  status: string;
  agency_visibility: string;
  is_primary: boolean | null;
  direct_booking_enabled?: boolean | null;
};

export type SelfRosterPlan =
  | { action: "insert" }
  | { action: "update"; patch: Record<string, unknown> }
  | { action: "noop" };

export function planSelfRosterRow(existing: SelfRosterRow | null): SelfRosterPlan {
  if (!existing) return { action: "insert" };

  const patch: Record<string, unknown> = {};
  if (existing.status !== "active") patch.status = "active";
  if (existing.agency_visibility === "roster_only") {
    patch.agency_visibility = "site_visible";
    // Upgrade only — do not flip the display switch on already-public rows.
    if (existing.direct_booking_enabled !== true) {
      patch.direct_booking_enabled = true;
    }
  }
  // Never write is_primary:true. If a bad row is primary, leave it —
  // flipping exclusive representation is not this helper's job.
  return Object.keys(patch).length === 0 ? { action: "noop" } : { action: "update", patch };
}

export async function ensureSelfRosterSiteVisible(
  admin: SupabaseClient,
  args: { tenantId: string; talentProfileId: string; addedBy?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { tenantId, talentProfileId, addedBy } = args;
  const { data, error } = await admin
    .from("agency_talent_roster")
    .select("status, agency_visibility, is_primary, direct_booking_enabled")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();

  if (error) {
    logServerError("ensure-self-roster.read", error);
    return { ok: false, error: "Could not read roster." };
  }

  const plan = planSelfRosterRow((data as SelfRosterRow | null) ?? null);
  if (plan.action === "noop") return { ok: true };

  if (plan.action === "insert") {
    const { error: insertErr } = await admin.from("agency_talent_roster").insert({
      tenant_id: tenantId,
      talent_profile_id: talentProfileId,
      source_type: "agency_created",
      status: "active",
      agency_visibility: "site_visible",
      hub_visibility_status: "not_submitted",
      is_primary: false,
      direct_booking_enabled: true,
      added_by: addedBy ?? null,
      source_workspace_id: tenantId,
    });
    if (insertErr) {
      logServerError("ensure-self-roster.insert", insertErr);
      return { ok: false, error: "Could not add you to this workspace roster." };
    }
    return { ok: true };
  }

  const { error: updateErr } = await admin
    .from("agency_talent_roster")
    .update(plan.patch)
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId);
  if (updateErr) {
    logServerError("ensure-self-roster.update", updateErr);
    return { ok: false, error: "Could not update your roster row." };
  }
  return { ok: true };
}

export async function resolveOwnerTalentProfileId(
  admin: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data: membership, error: memErr } = await admin
    .from("agency_memberships")
    .select("profile_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .eq("status", "active")
    .order("accepted_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memErr || !membership?.profile_id) {
    if (memErr) logServerError("ensure-self-roster.ownerMembership", memErr);
    return null;
  }

  const { data: tp, error: tpErr } = await admin
    .from("talent_profiles")
    .select("id")
    .eq("user_id", membership.profile_id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (tpErr) {
    logServerError("ensure-self-roster.ownerProfile", tpErr);
    return null;
  }
  return typeof tp?.id === "string" ? tp.id : null;
}
