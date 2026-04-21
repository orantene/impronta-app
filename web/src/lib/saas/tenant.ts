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
  | "coordinator"
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

async function fetchMemberships(
  supabase: SupabaseClient,
  userId: string,
): Promise<TenantMembership[]> {
  try {
    const { data, error } = await supabase
      .from("agency_memberships")
      .select(MEMBERSHIP_SELECT)
      .eq("profile_id", userId)
      .in("status", ["active", "pending_acceptance"]);

    if (error) {
      logServerError("saas/tenant.fetchMemberships", error);
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
export const getCurrentUserTenants = cache(
  async (): Promise<TenantMembership[]> => {
    const session = await getCachedActorSession();
    if (!session.supabase || !session.user) return [];

    const memberships = await fetchMemberships(session.supabase, session.user.id);

    if (session.profile?.app_role === "super_admin") {
      // Platform admin sees all tenants; fill in synthetic "admin" membership
      // for those where no real row exists so the switcher lists everything.
      const { data: allAgencies, error } = await session.supabase
        .from("agencies")
        .select("id, slug, display_name, status");

      if (error) {
        logServerError("saas/tenant.getCurrentUserTenants.all", error);
        return memberships;
      }

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
      return Array.from(known.values());
    }

    return memberships;
  },
);

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
