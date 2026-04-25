/**
 * Platform-role registry.
 *
 * Phase 1: only `super_admin` exists. Implementation-wise the platform role
 * is read from `profiles.platform_role` (Track B.2 migration adds the column)
 * with a fallback to the legacy `profiles.app_role = 'super_admin'` value
 * during the transition. After Track D, `app_role` for staff is dropped.
 *
 * Adding a new platform role (`support`, `platform_ops`, `reviewer`,
 * `finance`, etc.) means widening the CHECK constraint on
 * `profiles.platform_role` and adding an entry here. No new DB tables.
 *
 * See §8 of the architecture brief — minimal Phase 1 role model.
 */

import type { CapabilityKey } from "./capabilities";
import { CAPABILITY_KEYS } from "./capabilities";

export const PLATFORM_ROLE_KEYS = ["super_admin"] as const;

export type PlatformRoleKey = (typeof PLATFORM_ROLE_KEYS)[number];

export type PlatformRoleDef = {
  key: PlatformRoleKey;
  displayName: string;
  description: string;
  rank: number;
};

export const PLATFORM_ROLES: Record<PlatformRoleKey, PlatformRoleDef> = {
  super_admin: {
    key: "super_admin",
    displayName: "Super admin",
    description: "Full platform access. Can act on any tenant via support mode.",
    rank: 100,
  },
};

/**
 * Platform-role-to-capability map.
 *
 * `super_admin` grants every known capability. When more platform roles
 * are added (`support` etc.), each gets a narrower set.
 */
export const PLATFORM_ROLE_CAPABILITIES: Record<
  PlatformRoleKey,
  ReadonlySet<CapabilityKey>
> = {
  super_admin: new Set<CapabilityKey>(CAPABILITY_KEYS),
};

export function platformRoleGrantsCapability(
  role: PlatformRoleKey,
  cap: CapabilityKey,
): boolean {
  return PLATFORM_ROLE_CAPABILITIES[role].has(cap);
}

export function isKnownPlatformRole(role: string): role is PlatformRoleKey {
  return (PLATFORM_ROLE_KEYS as readonly string[]).includes(role);
}

/**
 * Profile shape this module needs. Loose: callers pass whatever they have,
 * we read the two fields we care about. Lets the access module avoid pulling
 * in supabase types.
 */
export type ProfileForPlatformRole = {
  platform_role?: string | null;
  app_role?: string | null;
};

/**
 * Resolve a profile's platform role.
 *
 * Dual-read during the transition: prefers the new
 * `profiles.platform_role` column when set, falls back to the legacy
 * `profiles.app_role = 'super_admin'` mapping. Returns `null` for any
 * profile that has no platform-level role (the common case for tenant users).
 *
 * After Track B.2 ships and the column is fully backfilled, the fallback is
 * still safe — it just stops mattering. After Track D drops the legacy
 * staff role, the fallback becomes dead code and gets removed.
 */
export function getPlatformRole(
  profile: ProfileForPlatformRole | null | undefined,
): PlatformRoleKey | null {
  if (!profile) return null;

  const explicit = profile.platform_role?.trim();
  if (explicit && isKnownPlatformRole(explicit)) {
    return explicit;
  }

  if (profile.app_role === "super_admin") {
    return "super_admin";
  }

  return null;
}

export function isPlatformAdmin(
  profile: ProfileForPlatformRole | null | undefined,
): boolean {
  return getPlatformRole(profile) === "super_admin";
}
