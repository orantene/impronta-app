import "server-only";

/**
 * Tenant context for a SOLO talent (signed up "For myself" or on the platform
 * with no agency). Their workspace is the Tulala hub roster row. Accounts made
 * before onboarding 1A, or where the hub step failed once, can have no active
 * roster row at all, which refused Services ("Talent is not on any active
 * roster.") and Hours ("Could not resolve the workspace for these hours.").
 *
 * Self-heal: when the talent has NO live roster row anywhere, the caller has
 * already proven ownership (profile.user_id = session user, or the talent
 * owns the hours being saved), so we ensure the hub row and use it. A talent
 * on any agency roster never reaches the heal: their agency scope is kept.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { ensurePlatformHubRoster } from "@/lib/saas/registration-policy";

type Db = Pick<SupabaseClient, "from">;
type EnsureHub = (
  talentProfileId: string,
  userId: string,
) => Promise<{ ok: true; tenantId: string } | { ok: false; error: string }>;

export async function ensureSoloTalentTenantId(
  admin: Db,
  talentProfileId: string,
  deps?: { ensureHub?: EnsureHub },
): Promise<string | null> {
  const { data: live, error: liveErr } = await admin
    .from("agency_talent_roster")
    .select("tenant_id")
    .eq("talent_profile_id", talentProfileId)
    .in("status", ["active", "pending"])
    .limit(1)
    .maybeSingle();
  if (liveErr) {
    logServerError("solo-talent-tenant.readRoster", liveErr);
    return null;
  }
  if (live?.tenant_id) return null; // an agency talent: never heal into the hub

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

  const ensureHub: EnsureHub =
    deps?.ensureHub ??
    ((id, userId) =>
      ensurePlatformHubRoster(admin as SupabaseClient, {
        talentProfileId: id,
        userId,
        originDomain: null,
      }));
  const hub = await ensureHub(talentProfileId, tp.user_id as string);
  if (!hub.ok) {
    logServerError("solo-talent-tenant.ensureHub", new Error(hub.error));
    return null;
  }
  return hub.tenantId;
}
