import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SaaS P1.B — tenant-scoped talent roster helpers.
 *
 * `talent_profiles` is a global (non-tenantised) table. Tenant visibility is
 * governed by `agency_talent_roster`. Every public storefront query for
 * talent — listing, preview, inquiry submission — must gate on the current
 * tenant's roster with an appropriate `agency_visibility`.
 *
 * These helpers centralise that join so callers don't re-derive the rule.
 */

export type RosterVisibility = "site_visible" | "featured";

const PUBLIC_VISIBILITIES: RosterVisibility[] = ["site_visible", "featured"];

/**
 * Filter a list of talent_profile_ids down to the ones that are on the given
 * tenant's roster and publicly visible. Returns the subset that is valid.
 * Callers should compare lengths to detect rejected ids.
 */
export async function filterTalentIdsOnTenantRoster(
  supabase: SupabaseClient,
  tenantId: string,
  talentProfileIds: string[],
): Promise<string[]> {
  if (talentProfileIds.length === 0) return [];
  const { data, error } = await supabase
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .in("agency_visibility", PUBLIC_VISIBILITIES)
    .in("talent_profile_id", talentProfileIds);
  if (error) return [];
  const valid = new Set(
    (data ?? []).map((row) => row.talent_profile_id as string),
  );
  return talentProfileIds.filter((id) => valid.has(id));
}

/**
 * Fetch every talent_profile_id that is currently site_visible or featured
 * for the given tenant. Use for storefront listing / search paths that need
 * to pre-filter the global `talent_profiles` result set.
 *
 * Returns an empty array when the tenant has no active, visible roster. The
 * caller should treat that as "no results" rather than "no filter".
 */
export async function listTalentIdsOnTenantRoster(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .in("agency_visibility", PUBLIC_VISIBILITIES);
  if (error) return [];
  return (data ?? []).map((row) => row.talent_profile_id as string);
}

/**
 * Admin-side roster view: every talent_profile_id on the tenant's roster in
 * any non-removed state (active, pending, inactive) and any
 * agency_visibility (roster_only, site_visible, featured).
 *
 * Use this to scope admin workspace queries (talent list, media queue,
 * overview counts). Storefront rendering should stay on
 * `listTalentIdsOnTenantRoster` above.
 */
export async function listAdminRosterTalentIds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .neq("status", "removed");
  if (error) return [];
  return (data ?? []).map((row) => row.talent_profile_id as string);
}

/**
 * True when the requested id is on the tenant's visible roster.
 */
export async function isTalentOnTenantRoster(
  supabase: SupabaseClient,
  tenantId: string,
  talentProfileId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .in("agency_visibility", PUBLIC_VISIBILITIES)
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/**
 * True when every requested id is on the tenant's visible roster. Use when
 * all-or-nothing rejection is appropriate (e.g. inquiry submission).
 */
export async function assertAllTalentOnTenantRoster(
  supabase: SupabaseClient,
  tenantId: string,
  talentProfileIds: string[],
): Promise<{ ok: true } | { ok: false; missingIds: string[] }> {
  if (talentProfileIds.length === 0) return { ok: true };
  const valid = await filterTalentIdsOnTenantRoster(
    supabase,
    tenantId,
    talentProfileIds,
  );
  const validSet = new Set(valid);
  const missing = talentProfileIds.filter((id) => !validSet.has(id));
  if (missing.length === 0) return { ok: true };
  return { ok: false, missingIds: missing };
}
