import { loadAccessProfile } from "@/lib/access-profile";
import { isStaffRole } from "@/lib/auth-flow";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { assertMutationsAllowedWhileImpersonating } from "@/lib/impersonation/write-policy";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { AccessProfileWithDisplayName } from "@/lib/access-profile";

export type GuardedSession = {
  supabase: SupabaseClient;
  user: User;
  profile: AccessProfileWithDisplayName | null;
};

type GuardFail = { ok: false; error: string };

type GuardOk = { ok: true } & GuardedSession;

export async function requireSession(): Promise<GuardOk | GuardFail> {
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, error: "Not configured." };
  }
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, error: "You must be signed in." };
  }
  const profile = await loadAccessProfile(supabase, user.id);
  return { ok: true, supabase, user, profile };
}

/** Agency staff routes (`super_admin` or `agency_staff`). */
export async function requireStaff(): Promise<GuardOk | GuardFail> {
  const session = await requireSession();
  if (!session.ok) return session;
  if (!session.profile || !isStaffRole(session.profile.app_role)) {
    return { ok: false, error: "Not authorized." };
  }
  return session;
}

/** Super-admin only — use for destructive or global settings when you need it. */
export async function requireAdmin(): Promise<GuardOk | GuardFail> {
  const session = await requireSession();
  if (!session.ok) return session;
  if (session.profile?.app_role !== "super_admin") {
    return { ok: false, error: "Not authorized." };
  }
  return session;
}

/**
 * Talent workspace mutations. Uses {@link resolveDashboardIdentity} (subject role).
 * Blocked while super-admin is impersonating (v1 read-only QA).
 */
export async function requireTalent(): Promise<GuardOk | GuardFail> {
  const identity = await resolveDashboardIdentity();
  if (!identity) {
    return { ok: false, error: "You must be signed in." };
  }
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, error: "Not configured." };
  }

  const write = assertMutationsAllowedWhileImpersonating(identity);
  if (!write.ok) return write;

  if (identity.subjectRole !== "talent") {
    return { ok: false, error: "Not authorized." };
  }

  return {
    ok: true,
    supabase,
    user: identity.actorUser,
    profile: identity.effectiveProfile,
  };
}

/**
 * Client workspace mutations. Uses {@link resolveDashboardIdentity}.
 * Blocked while super-admin is impersonating (v1 read-only QA).
 */
export async function requireClient(): Promise<GuardOk | GuardFail> {
  const identity = await resolveDashboardIdentity();
  if (!identity) {
    return { ok: false, error: "You must be signed in." };
  }
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, error: "Not configured." };
  }

  const write = assertMutationsAllowedWhileImpersonating(identity);
  if (!write.ok) return write;

  if (identity.subjectRole !== "client") {
    return { ok: false, error: "Not authorized." };
  }

  return {
    ok: true,
    supabase,
    user: identity.actorUser,
    profile: identity.effectiveProfile,
  };
}

/**
 * Confirms the authenticated user owns the given `userId` (e.g. profile row).
 * RLS remains authoritative; this adds an explicit app-layer check.
 */
export function requireOwner(
  session: GuardOk,
  ownerUserId: string,
): GuardOk | GuardFail {
  if (session.user.id !== ownerUserId) {
    return { ok: false, error: "Not authorized." };
  }
  return session;
}
