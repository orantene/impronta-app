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
    .eq("talent_site_hidden", false)
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
    .in("agency_visibility", PUBLIC_VISIBILITIES)
    .eq("talent_site_hidden", false);
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
    .eq("talent_site_hidden", false)
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

/**
 * The tenant that GOVERNS a talent's presentation when no surface tenant is
 * available (the hub / platform / talent-site hosts, where the request carries
 * no agency tenant of its own).
 *
 * This mirrors the roster lookup the public profile already uses to resolve
 * field-engine overrides (`fetchPublicFieldValues`), so category overrides,
 * field VALUE overrides and sidebar SECTION overrides all key on the SAME
 * tenant instead of disagreeing between the hub host and the tenant host.
 * Returns null when the talent is on no active roster (an unaffiliated
 * freelancer — nobody has authority to override them).
 *
 * MULTI-TENANT talent: a talent can sit on several tenants' rosters at once, so
 * "the" governing tenant has to be picked deterministically or the hub would
 * render different sections on different requests (and disagree with itself
 * across the unstable_cache TTL). The order is:
 *   1. `is_primary` — the schema guarantees AT MOST ONE primary agency per
 *      talent (`agency_talent_roster_talent_primary_uniq`), and primary is
 *      already the platform's ownership/routing concept, so it is the right
 *      answer whenever it is set.
 *   2. `added_at` ascending — the establishing agency wins. Stable over time:
 *      a later agency joining the roster cannot silently change what the hub
 *      shows.
 *   3. `id` ascending — total order, so the result never depends on Postgres
 *      row order even for same-instant `added_at`.
 */
export async function resolveGoverningTenantIdForTalent(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<string | null> {
  if (!talentProfileId) return null;
  const { data, error } = await supabase
    .from("agency_talent_roster")
    .select("tenant_id, is_primary, added_at, id")
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "active")
    .order("is_primary", { ascending: false })
    .order("added_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);
  if (error) return null;
  const rows = (data ?? []) as Array<{ tenant_id?: string }>;
  return rows[0]?.tenant_id ?? null;
}

/**
 * The tenant whose `workspace_profile_field_settings` / taxonomy overrides
 * govern a talent's PUBLIC profile on the current host.
 *
 * Single source of truth for every override-keyed read on /t/[profileCode] —
 * field values, category (taxonomy) visibility, and sidebar SECTION visibility
 * all call this so they cannot disagree with one another.
 *
 * `surfaceTenantId` must be the tenant of an AGENCY host only. `getPublicHostContext`
 * returns a non-null `tenantId` for `kind: "hub"` too — that is the hub agency's
 * OWN tenant, which has no authority over a roster talent's profile — so callers
 * pass `hostCtx.kind === "agency" ? hostCtx.tenantId : null`.
 *
 * Returns null when nothing governs (no agency host, no active roster row).
 * Null means "canonical defaults, no tenant override", which is the same
 * decision the values path already makes for an unaffiliated talent — NOT
 * "show everything": the canonical safety floor still applies.
 */
export async function resolvePublicProfileOverrideTenantId(
  supabase: SupabaseClient,
  surfaceTenantId: string | null,
  talentProfileId: string,
): Promise<string | null> {
  if (surfaceTenantId) return surfaceTenantId;
  return resolveGoverningTenantIdForTalent(supabase, talentProfileId);
}
