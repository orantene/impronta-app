import { isStaffRole } from "@/lib/auth-flow";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { assertMutationsAllowedWhileImpersonating } from "@/lib/impersonation/write-policy";
import {
  getCachedActorSession,
  getCachedServerSupabase,
} from "@/lib/server/request-cache";
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
  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) {
    if (!session.supabase) {
      return { ok: false, error: "Not configured." };
    }
    return { ok: false, error: "You must be signed in." };
  }
  return {
    ok: true,
    supabase: session.supabase,
    user: session.user,
    profile: session.profile,
  };
}

/**
 * GLOBAL-role gate (`profiles.app_role` is `super_admin` or `agency_staff`).
 *
 * ⚠️ NOT a workspace gate. Do NOT use this for anything tenant-scoped.
 *
 * `app_role` is a PLATFORM attribute; workspace access is MEMBERSHIP-based
 * (`agency_memberships` → RLS `is_staff_of_tenant()`, which never consults
 * `app_role`). The product explicitly supports **hybrid workspace owners** — a
 * talent/client-signup user who creates or is granted a workspace keeps
 * `app_role='talent'`/`'client'` (see `workspace-lifecycle.ts`) — so this guard
 * rejects legitimate owners on their own workspace while the surrounding UI,
 * gated on the membership capability `agency.workspace.view`, happily renders.
 * That mismatch was the Card Design studio outage (PR #990) and the roster /
 * builder / storefront-editor class swept in this change.
 *
 * For tenant-scoped work use, in order of preference:
 *   1. `requireStaffTenantAction({ capability })` from `@/lib/saas/admin-scope`
 *      — session + membership-fail-closed tenant scope + capability;
 *   2. `requireSession()` + `getTenantScope()` / `getTenantScopeBySlug()`
 *      when you need the scope object directly;
 *   3. `requireSession()` + `userHasCapability(cap, tenantId)` when the tenant
 *      arrives as an argument rather than from the request.
 *
 * Legitimate remaining uses are PLATFORM-global surfaces with no tenant to
 * scope to (the shared translation / taxonomy / location catalogs, cross-tenant
 * analytics, dev-only routes). Prefer `requireAdmin()` when the surface is
 * genuinely super-admin-only.
 */
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
  const supabase = await getCachedServerSupabase();
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
  const supabase = await getCachedServerSupabase();
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
