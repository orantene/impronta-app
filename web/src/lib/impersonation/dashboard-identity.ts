import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAccessProfile, type AccessProfileWithDisplayName } from "@/lib/access-profile";
import { IMPERSONATION_COOKIE_NAME } from "@/lib/impersonation/constants";
import { parseImpersonationCookie } from "@/lib/impersonation/cookie";
import { loadProfileRowById } from "@/lib/impersonation/profile-lookup";
import { validateImpersonationTargetProfile } from "@/lib/impersonation/validate";
import { createClient } from "@/lib/supabase/server";

export type DashboardIdentity = {
  actorUser: User;
  actorProfile: AccessProfileWithDisplayName | null;
  /** Row owner for talent_profiles / client_profiles queries. */
  effectiveUserId: string;
  effectiveProfile: AccessProfileWithDisplayName | null;
  isImpersonating: boolean;
  /** ISO timestamp from cookie iat, or null. */
  impersonationStartedAt: string | null;
  /** Effective user's app_role (routing / workspace). */
  subjectRole: string | null;
};

function impersonationSecret(): string | undefined {
  return process.env.IMPERSONATION_COOKIE_SECRET?.trim() || undefined;
}

export type ImpersonationRoutingResolution = {
  routingProfile: AccessProfileWithDisplayName | null;
  isImpersonating: boolean;
  clearCookie: boolean;
};

/**
 * Middleware: derive routing profile + whether to clear an invalid cookie.
 */
export async function resolveImpersonationRoutingForMiddleware(input: {
  rawCookie: string | undefined;
  supabase: SupabaseClient;
  actorUserId: string;
  actorProfile: AccessProfileWithDisplayName | null;
}): Promise<ImpersonationRoutingResolution> {
  const secret = impersonationSecret();
  const hadCookie = Boolean(input.rawCookie?.length);
  const parsed = await parseImpersonationCookie(input.rawCookie, secret);

  if (!parsed.ok) {
    return {
      routingProfile: input.actorProfile,
      isImpersonating: false,
      clearCookie: hadCookie,
    };
  }

  const targetProfile = await loadProfileRowById(
    input.supabase,
    parsed.data.targetUserId,
  );
  const check = validateImpersonationTargetProfile({
    actorUserId: input.actorUserId,
    actorAppRole: input.actorProfile?.app_role,
    targetUserId: parsed.data.targetUserId,
    targetProfile,
  });

  if (!check.ok) {
    return {
      routingProfile: input.actorProfile,
      isImpersonating: false,
      clearCookie: true,
    };
  }

  return {
    routingProfile: targetProfile,
    isImpersonating: true,
    clearCookie: false,
  };
}

function buildNonImpersonatingIdentity(
  actorUser: User,
  actorProfile: AccessProfileWithDisplayName | null,
): DashboardIdentity {
  return {
    actorUser,
    actorProfile,
    effectiveUserId: actorUser.id,
    effectiveProfile: actorProfile,
    isImpersonating: false,
    impersonationStartedAt: null,
    subjectRole: actorProfile?.app_role ?? null,
  };
}


/**
 * Single source of truth for actor, effective user, impersonation, subject role (RSC + server actions).
 */
export async function resolveDashboardIdentity(): Promise<DashboardIdentity | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const actorProfile = await loadAccessProfile(supabase, user.id);
  const cookieStore = await cookies();
  const raw = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
  const secret = impersonationSecret();
  const parsed = await parseImpersonationCookie(raw, secret);

  if (!parsed.ok) {
    if (raw?.length) {
      await clearImpersonationCookieIfPresent();
    }
    return buildNonImpersonatingIdentity(user, actorProfile);
  }

  const targetProfile = await loadProfileRowById(
    supabase,
    parsed.data.targetUserId,
  );
  const check = validateImpersonationTargetProfile({
    actorUserId: user.id,
    actorAppRole: actorProfile?.app_role,
    targetUserId: parsed.data.targetUserId,
    targetProfile,
  });

  if (!check.ok) {
    await clearImpersonationCookieIfPresent();
    return buildNonImpersonatingIdentity(user, actorProfile);
  }

  return {
    actorUser: user,
    actorProfile,
    effectiveUserId: parsed.data.targetUserId,
    effectiveProfile: targetProfile,
    isImpersonating: true,
    impersonationStartedAt: new Date(parsed.data.iat).toISOString(),
    subjectRole: targetProfile?.app_role ?? null,
  };
}

/** Optional: clear cookie from RSC when app detects inconsistency. */
export async function clearImpersonationCookieIfPresent(): Promise<void> {
  const cookieStore = await cookies();
  if (!cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value) return;
  cookieStore.delete(IMPERSONATION_COOKIE_NAME);
}
