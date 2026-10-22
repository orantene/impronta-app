import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

/**
 * TUL-1517: a writer that accepts an id (package component, comp tier variant, series venue or
 * instructor, waitlist zone) must prove the id belongs to the caller's tenant BEFORE it writes.
 * A service-role client bypasses RLS, and several RPCs do not check the foreign id themselves.
 *
 * Every function answers `wrong_tenant` for a foreign OR missing id (never says which, so a
 * caller cannot probe another workspace) and `unavailable` when the lookup itself fails.
 */
export type OwnedIdsResult = { ok: true } | { ok: false; reason: "wrong_tenant" | "unavailable" };

type AnyAdmin = { from: (table: string) => unknown };

const asClient = (admin: AnyAdmin) => admin as unknown as SupabaseClient;

function uniq(ids: ReadonlyArray<string | null | undefined>): string[] {
  return [...new Set(ids.filter((v): v is string => typeof v === "string" && v.trim().length > 0))];
}

/** Every id is a row of `table` in this tenant. Table must carry `tenant_id`. */
export async function assertIdsBelongToTenant(
  admin: AnyAdmin,
  table: string,
  ids: ReadonlyArray<string | null | undefined>,
  tenantId: string,
): Promise<OwnedIdsResult> {
  const wanted = uniq(ids);
  if (wanted.length === 0) return { ok: true };
  if (!tenantId) return { ok: false, reason: "wrong_tenant" };
  const { data, error } = await tenantScopedQuery(asClient(admin), table, tenantId).select("id").in("id", wanted);
  if (error) {
    logServerError(`tenancy.assertIdsBelongToTenant.${table}`, error);
    return { ok: false, reason: "unavailable" };
  }
  const found = new Set(((data ?? []) as unknown as Array<{ id: string }>).map((r) => r.id));
  return wanted.every((id) => found.has(id)) ? { ok: true } : { ok: false, reason: "wrong_tenant" };
}

/** Variants have no tenant column: each must hang off an offering of this tenant. */
export async function assertVariantsBelongToTenant(
  admin: AnyAdmin,
  variantIds: ReadonlyArray<string | null | undefined>,
  tenantId: string,
): Promise<OwnedIdsResult> {
  const wanted = uniq(variantIds);
  if (wanted.length === 0) return { ok: true };
  const { data, error } = await asClient(admin).from("talent_offering_variants").select("id, offering_id").in("id", wanted);
  if (error) {
    logServerError("tenancy.assertVariantsBelongToTenant.variants", error);
    return { ok: false, reason: "unavailable" };
  }
  const rows = (data ?? []) as Array<{ id: string; offering_id: string | null }>;
  if (new Set(rows.map((r) => r.id)).size !== wanted.length) return { ok: false, reason: "wrong_tenant" };
  if (!rows.every((r) => r.offering_id)) return { ok: false, reason: "wrong_tenant" };
  return assertIdsBelongToTenant(
    admin,
    "talent_offerings",
    rows.map((r) => r.offering_id),
    tenantId,
  );
}

/**
 * The user may teach in this tenant (an unclaimed talent with no user_id cannot be an instructor yet): an ACTIVE staff membership, or an ACTIVE roster row for a
 * talent profile they own (roster talents teach classes too). Anything else is refused.
 */
export async function assertUserIsTenantStaff(
  admin: AnyAdmin,
  userId: string | null | undefined,
  tenantId: string,
): Promise<OwnedIdsResult> {
  if (!userId || !tenantId) return { ok: false, reason: "wrong_tenant" };
  const staff = await tenantScopedQuery(asClient(admin), "agency_memberships", tenantId)
    .select("id")
    .eq("profile_id", userId)
    .eq("status", "active")
    .limit(1);
  if (staff.error) {
    logServerError("tenancy.assertUserIsTenantStaff", staff.error);
    return { ok: false, reason: "unavailable" };
  }
  if (Array.isArray(staff.data) && staff.data.length > 0) return { ok: true };

  const profiles = await asClient(admin).from("talent_profiles").select("id").eq("user_id", userId);
  if (profiles.error) {
    logServerError("tenancy.assertUserIsTenantStaff.profiles", profiles.error);
    return { ok: false, reason: "unavailable" };
  }
  const profileIds = ((profiles.data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (profileIds.length === 0) return { ok: false, reason: "wrong_tenant" };
  const roster = await tenantScopedQuery(asClient(admin), "agency_talent_roster", tenantId)
    .select("id")
    .in("talent_profile_id", profileIds)
    .eq("status", "active")
    .limit(1);
  if (roster.error) {
    logServerError("tenancy.assertUserIsTenantStaff.roster", roster.error);
    return { ok: false, reason: "unavailable" };
  }
  return Array.isArray(roster.data) && roster.data.length > 0 ? { ok: true } : { ok: false, reason: "wrong_tenant" };
}
