/**
 * Post-auth landing path resolver — replaces `dashboardPathForRole` from
 * `lib/auth-flow.ts`.
 *
 * Decision tree, in order:
 *   1. No profile / no app_role → /onboarding/role
 *   2. Account status not 'active' (excluding 'onboarding') → /
 *   3. Platform admin (super_admin) → /admin
 *   4. Tenant role (talent/client surface) → /talent or /client
 *   5. Workspace member (any tenant role) → /admin (current single-tenant
 *      behavior). Post-Track-A this becomes /{primarySlug}/admin or
 *      /workspace for multi-membership users.
 *   6. Otherwise → /onboarding/role
 *
 * The shape mirrors the existing helpers exactly so callers can swap with
 * no behavior change. Multi-tenant routing (`/{slug}/admin`,
 * `/workspace`) is a Track A deliverable — until then `landingPath`
 * returns `/admin` for any workspace member, matching today's reality.
 */

import { isPlatformAdmin, type ProfileForPlatformRole } from "./platform-role";

export type LandingProfile = ProfileForPlatformRole & {
  account_status?: string | null;
  onboarding_completed_at?: string | null;
};

export type LandingPathInput = {
  profile: LandingProfile | null | undefined;
  /** Slugs the user is an active member of. Empty = no tenant memberships. */
  membershipSlugs?: readonly string[];
  /** Optional: a `?next=` value the caller already validated. */
  validatedNext?: string | null;
};

export type LandingDestination =
  | "/admin"
  | "/talent"
  | "/client"
  | "/onboarding/role"
  | "/workspace"
  | "/"
  | string; // for validatedNext or future /{slug}/admin

/**
 * Resolve where to send a user after authentication / on a generic-route hit.
 *
 * Pre-Track-A behavior matches `dashboardPathForRole` + `resolveAuthenticatedDestination`:
 * staff-flagged users land on `/admin`, talent on `/talent`, client on `/client`,
 * everyone else on `/onboarding/role`. Multi-membership picker (`/workspace`)
 * activates only when callers explicitly pass `membershipSlugs.length >= 2`.
 */
export function landingPath(input: LandingPathInput): LandingDestination {
  const { profile, membershipSlugs, validatedNext } = input;

  if (validatedNext && validatedNext.startsWith("/") && !validatedNext.startsWith("//")) {
    return validatedNext;
  }

  if (!profile?.app_role) return "/onboarding/role";

  const status = profile.account_status;
  if (status === "onboarding" || status === "registered") {
    return "/onboarding/role";
  }
  if (status && status !== "active") {
    return "/";
  }

  // Platform admins go straight to the platform shell.
  if (isPlatformAdmin(profile)) return "/admin";

  // Talent and client surfaces are user-scoped (not workspace-scoped).
  if (profile.app_role === "talent") return "/talent";
  if (profile.app_role === "client") return "/client";

  // Workspace member surface. Pre-Track-A, all staff land on /admin.
  // After Track A this returns:
  //   - /{primarySlug}/admin  when membershipSlugs.length === 1
  //   - /workspace            when membershipSlugs.length >= 2
  //   - /onboarding/agency    when membershipSlugs.length === 0
  //
  // The legacy `app_role = 'agency_staff'` mapping continues to land on
  // /admin during the dual-read transition.
  if (profile.app_role === "agency_staff") {
    if (membershipSlugs && membershipSlugs.length >= 2) return "/workspace";
    return "/admin";
  }

  return "/onboarding/role";
}

/** True for any role allowed in `/admin/*` today. */
export function isStaffSurfaceRole(
  profile: LandingProfile | null | undefined,
): boolean {
  if (!profile) return false;
  if (isPlatformAdmin(profile)) return true;
  return profile.app_role === "agency_staff";
}
