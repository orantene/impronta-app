/**
 * role-tenant-resolver.ts
 *
 * Lightweight helpers for resolving a user's primary agency slug from their
 * role-specific profile table, used by thin root-route redirectors
 * (app/talent/page.tsx, app/client/page.tsx) that need to bounce users to
 * the canonical /{slug}/talent/* or /{slug}/client/* workspace paths.
 *
 * These are distinct from getTenantScope() / getCurrentUserTenants(), which
 * work off agency_memberships (staff-only). Talent and client users don't
 * have membership rows; their tenants are reached through roster/relationship
 * tables instead.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Resolve the primary agency slug for a talent user.
 *
 * Resolution: talent_profiles.user_id → agency_talent_roster.talent_profile_id
 * → agency_talent_roster.tenant_id → agencies.slug
 *
 * Returns the first active (non-removed) roster entry's slug, or null if the
 * user has no talent profile or no roster membership.
 */
export async function loadTalentPrimaryTenantSlug(
  userId: string,
): Promise<string | null> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;

    // Step 1: Find talent profile id for this user.
    const { data: profile, error: profileErr } = await admin
      .from("talent_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr) {
      logServerError("role-tenant-resolver.talent.profile", profileErr);
      return null;
    }
    if (!profile) return null;

    // Step 2: Find first active roster entry with agency slug.
    const { data: roster, error: rosterErr } = await admin
      .from("agency_talent_roster")
      .select("agencies!tenant_id ( slug )")
      .eq("talent_profile_id", profile.id)
      .neq("status", "removed")
      .limit(1)
      .maybeSingle();

    if (rosterErr) {
      logServerError("role-tenant-resolver.talent.roster", rosterErr);
      return null;
    }

    type RosterRow = {
      agencies: { slug: string } | { slug: string }[] | null;
    };
    const row = roster as unknown as RosterRow | null;
    if (!row) return null;

    const agencies = row.agencies;
    const agency = Array.isArray(agencies) ? agencies[0] : agencies;
    return agency?.slug ?? null;
  } catch (err) {
    logServerError("role-tenant-resolver.talent", err);
    return null;
  }
}

/**
 * Resolve the primary agency slug for a client user.
 *
 * Resolution: client_profiles.user_id → agency_client_relationships.client_profile_id
 * → agency_client_relationships.tenant_id → agencies.slug
 *
 * Returns the first active relationship's slug, or null.
 */
export async function loadClientPrimaryTenantSlug(
  userId: string,
): Promise<string | null> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;

    // Step 1: Find client profile id.
    const { data: profile, error: profileErr } = await admin
      .from("client_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr) {
      logServerError("role-tenant-resolver.client.profile", profileErr);
      return null;
    }
    if (!profile) return null;

    // Step 2: Find first active relationship with agency slug.
    const { data: relationship, error: relErr } = await admin
      .from("agency_client_relationships")
      .select("agencies!tenant_id ( slug )")
      .eq("client_profile_id", profile.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (relErr) {
      logServerError("role-tenant-resolver.client.relationship", relErr);
      return null;
    }

    type RelRow = {
      agencies: { slug: string } | { slug: string }[] | null;
    };
    const row = relationship as unknown as RelRow | null;
    if (!row) return null;

    const agencies = row.agencies;
    const agency = Array.isArray(agencies) ? agencies[0] : agencies;
    return agency?.slug ?? null;
  } catch (err) {
    logServerError("role-tenant-resolver.client", err);
    return null;
  }
}
