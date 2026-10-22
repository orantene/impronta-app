import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Seed tenant for legacy single-tenant data.
 * Mirrors DEFAULT_AI_TENANT_ID and the agencies.id value seeded in
 * 20260601100000_saas_p1_agencies.sql. Use it only for SEED/BACKFILL paths —
 * never as a runtime fallback (Plan L37, fail-hard resolution).
 */
export const LEGACY_TENANT_ID = "00000000-0000-0000-0000-000000000001" as const;

/**
 * Hub (platform-wide directory) tenant UUID — singleton, seeded in
 * 20260625100000_saas_p56_m0_org_kind_and_hub_seed.sql. Unlike
 * LEGACY_TENANT_ID this IS intended for runtime use: hub-scoped writes
 * (hub visibility requests, federated directory) target this id. The
 * organization_kind discriminator is 'hub'.
 */
export const HUB_AGENCY_ID = "00000000-0000-0000-0000-000000000002" as const;

export type MembershipRole =
  | "owner"
  | "admin"
  | "manager"
  | "editor"
  | "viewer";

export type MembershipStatus =
  | "invited"
  | "pending_acceptance"
  | "active"
  | "suspended"
  | "removed"
  | "expired_invite";

export type TenantMembership = {
  tenant_id: string;
  role: MembershipRole;
  status: MembershipStatus;
  slug: string;
  display_name: string;
  agency_status: string;
};

type MembershipRow = {
  tenant_id: string;
  role: MembershipRole;
  status: MembershipStatus;
  agencies: {
    slug: string;
    display_name: string;
    status: string;
  } | null;
};

// NOTE: `agency_memberships` has no `is_primary` column (confirmed against the
// live schema — the P1 table lists id, tenant_id, profile_id, role, status,
// invited_by, invited_at, invite_expires_at, accepted_at, removed_at,
// removed_by, created_at, updated_at). Any legacy references to a primary
// membership were drift; default-tenant selection now falls through to the
// first active membership (see scope.pickDefault).
const MEMBERSHIP_SELECT =
  "tenant_id, role, status, agencies:tenant_id ( slug, display_name, status )";

// Module-level membership cache — survives across server action calls within
// the same process instance. React's cache() only deduplicates within a single
// request; without this, every server action pays a round-trip to Supabase for
// membership data that doesn't change mid-session.
// 30s TTL: short enough that a plan/role change takes effect quickly, long
// enough to eliminate redundant DB hits during normal admin work.
const _membershipCache = new Map<string, { data: TenantMembership[]; ts: number }>();
const MEMBERSHIP_CACHE_TTL = 30_000;

/**
 * Forget the process-level membership list for one user. Call it after a
 * membership row is written in the same process: a workspace provisioned
 * seconds after the marketing shell listed this user's tenants would
 * otherwise fail its own capability checks (`no_membership`) for up to 30 s.
 * The React `cache()` layer is per request and cannot be cleared; callers
 * that need the fresh list inside the same request read it explicitly.
 */
export function forgetUserTenantMemberships(userId: string): void {
  _membershipCache.delete(userId);
}

async function fetchMemberships(
  supabase: SupabaseClient,
  userId: string,
  onFailure?: () => void,
): Promise<TenantMembership[]> {
  try {
    const { data, error } = await supabase
      .from("agency_memberships")
      .select(MEMBERSHIP_SELECT)
      .eq("profile_id", userId)
      .in("status", ["active", "pending_acceptance"]);

    if (error) {
      logServerError("saas/tenant.fetchMemberships", error);
      onFailure?.();
      return [];
    }

    const rows = (data ?? []) as unknown as MembershipRow[];
    return rows
      .filter((row) => row.agencies !== null)
      .map((row) => ({
        tenant_id: row.tenant_id,
        role: row.role,
        status: row.status,
        slug: row.agencies!.slug,
        display_name: row.agencies!.display_name,
        agency_status: row.agencies!.status,
      }));
  } catch (error) {
    logServerError("saas/tenant.fetchMemberships", error);
    return [];
  }
}

/**
 * All tenants the current actor can operate within. Request-scoped cache.
 *
 * Platform super_admins see every tenant in the system; agency staff see
 * only tenants they are active/pending members of. Unauthenticated callers
 * get an empty array.
 */
export async function loadUserTenants(
  supabase: SupabaseClient,
  userId: string,
  appRole: string | null | undefined,
  opts: { fresh?: boolean } = {},
): Promise<TenantMembership[]> {
  if (!opts.fresh) {
    const hit = _membershipCache.get(userId);
    if (hit && Date.now() - hit.ts < MEMBERSHIP_CACHE_TTL) return hit.data;
  }

  // TUL-1840: a failed read looks like "no memberships". It must never be
  // memoised, or an owner is told they have no workspace for the whole TTL.
  let failed = false;
  const memberships = await fetchMemberships(supabase, userId, () => {
    failed = true;
  });

  let result = memberships;
  if (appRole === "super_admin") {
    // Platform admin sees all tenants; fill in synthetic "admin" membership
    // for those where no real row exists so the switcher lists everything.
    const { data: allAgencies, error } = await supabase
      .from("agencies")
      .select("id, slug, display_name, status");

    if (error) {
      failed = true;
      logServerError("saas/tenant.getCurrentUserTenants.all", error);
    } else {
      const known = new Map(memberships.map((m) => [m.tenant_id, m]));
      for (const agency of allAgencies ?? []) {
        if (known.has(agency.id)) continue;
        known.set(agency.id, {
          tenant_id: agency.id,
          role: "admin",
          status: "active",
          slug: agency.slug,
          display_name: agency.display_name,
          agency_status: agency.status,
        });
      }
      result = Array.from(known.values());
    }
  }

  if (!failed) _membershipCache.set(userId, { data: result, ts: Date.now() });
  return result;
}

export const getCurrentUserTenants = cache(
  async (): Promise<TenantMembership[]> => {
    const session = await getCachedActorSession();
    if (!session.supabase || !session.user) return [];
    return loadUserTenants(session.supabase, session.user.id, session.profile?.app_role);
  },
);

/**
 * TUL-1840: the membership list read straight from the database, skipping the
 * 30 s process memo. Callers use it ONLY when the memoised answer says "no
 * access" (workspace not found for this user, or no membership at all) and are
 * about to redirect or 404 on it. A stale "no" then costs one extra read
 * instead of bouncing an owner away from their own workspace; a stale "yes"
 * is not a concern here because grants are re-checked per capability.
 * Access is never widened: the fresh list is the same RLS-scoped query.
 * Refreshes the memo as a side effect so the rest of the session agrees.
 */
export async function getFreshUserTenants(): Promise<TenantMembership[]> {
  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) return [];
  return loadUserTenants(session.supabase, session.user.id, session.profile?.app_role, { fresh: true });
}

export async function requireStaffOfTenant(tenantId: string): Promise<void> {
  const tenants = await getCurrentUserTenants();
  const match = tenants.find((t) => t.tenant_id === tenantId);
  if (!match) {
    throw new Error(`forbidden: caller is not staff of tenant ${tenantId}`);
  }
}

/**
 * Returns a tenant membership by id, or null. Does not throw.
 */
export async function findTenantMembership(
  tenantId: string,
): Promise<TenantMembership | null> {
  const tenants = await getCurrentUserTenants();
  return tenants.find((t) => t.tenant_id === tenantId) ?? null;
}
