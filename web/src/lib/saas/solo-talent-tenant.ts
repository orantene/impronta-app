/**
 * Tenant context for a SOLO talent (signed up "For myself" or on the platform
 * with no agency). Their workspace is the Tulala hub roster row. Accounts made
 * before onboarding 1A, or where the hub step failed once, can have no roster
 * row at all, which refused Services ("Talent is not on any active roster.")
 * and Hours ("Could not resolve the workspace for these hours.").
 *
 * Self-heal: the caller has already proven ownership (profile.user_id = session
 * user, or the talent owns the hours being saved). We then apply the ONE
 * hub-roster rule (`ensureHubRosterRow`): a hub row is added only when the
 * talent has NO roster row at all, on any tenant, in any status. A talent on an
 * agency roster, or one whose row was removed/inactive, is never silently
 * re-added; she keeps the existing clean "not on any active roster" error. The
 * only promotion is a sole pending/inactive HUB row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { ensureHubRosterRow, type EnsureHubRosterResult } from "@/lib/saas/ensure-hub-roster.server";

type Db = Pick<SupabaseClient, "from">;
type EnsureHub = (args: { talentProfileId: string; addedBy: string }) => Promise<EnsureHubRosterResult>;

export async function ensureSoloTalentTenantId(
  admin: Db,
  talentProfileId: string,
  deps?: { ensureHub?: EnsureHub },
): Promise<string | null> {
  const { data: tp, error: tpErr } = await admin
    .from("talent_profiles")
    .select("user_id, created_by_agency_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (tpErr) {
    logServerError("solo-talent-tenant.readProfile", tpErr);
    return null;
  }
  if (!tp?.user_id || tp.created_by_agency_id) return null;

  const ensureHub: EnsureHub = deps?.ensureHub ?? ((args) => ensureHubRosterRow(admin, { ...args, originDomain: null }));
  const hub = await ensureHub({ talentProfileId, addedBy: tp.user_id as string });
  if (!hub.ok) {
    logServerError("solo-talent-tenant.ensureHub", new Error(hub.reason));
    return null;
  }
  // Only a created/promoted hub row heals. "skipped_has_roster" means she has a
  // row (agency, removed, inactive, or already live): never move her to the hub.
  if (hub.outcome === "skipped_has_roster") return null;
  return hub.tenantId;
}
