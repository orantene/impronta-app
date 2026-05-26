import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { requireStaff } from "@/lib/server/action-guards";
import { getTenantScope, type TenantScope } from "./scope";

/**
 * Guard for admin server components / actions / route handlers that operate on
 * tenant-scoped data (inquiries, agency_bookings, client_accounts,
 * client_account_contacts, inquiry_messages, etc.).
 *
 * Resolves the active tenant via {@link getTenantScope}. When unresolved, the
 * caller MUST refuse the request — there is no runtime fallback to the seed
 * tenant (Plan L37). This helper `redirect()`s to `/admin?err=no_tenant` so
 * pages/actions get a fail-hard code path without every call site having to
 * handle `null`.
 *
 * Use the returned `tenantId` directly on `.eq("tenant_id", tenantId)` filters,
 * or on `insert({ tenant_id, ... })` payloads. The DB triggers from Phase-1B
 * provide defense-in-depth when a write path forgets.
 */
export type AdminTenantGuard = {
  supabase: SupabaseClient;
  scope: TenantScope;
  tenantId: string;
};

export async function requireAdminTenantGuard(options?: {
  /** Redirect target when no tenant scope resolves. Defaults to the admin
   * dashboard with an `err` param the shell surfaces to the user. */
  redirectTo?: string;
}): Promise<AdminTenantGuard> {
  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    redirect("/login?error=config");
  }
  const scope = await getTenantScope();
  if (!scope) {
    redirect(options?.redirectTo ?? "/admin?err=no_tenant");
  }
  return { supabase, scope, tenantId: scope.tenantId };
}

/**
 * Like {@link requireAdminTenantGuard} but throws instead of redirecting —
 * use from server actions / API routes where a redirect isn't appropriate and
 * the caller wants to return a 403 / structured error.
 */
export async function requireAdminTenantGuardOrThrow(): Promise<AdminTenantGuard> {
  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    throw new Error("supabase not configured");
  }
  const scope = await getTenantScope();
  if (!scope) {
    throw new Error("no tenant scope resolved for this admin request");
  }
  return { supabase, scope, tenantId: scope.tenantId };
}

/**
 * Server-action guard: authenticates agency staff AND resolves the active
 * tenant. Returns an `AdminActionState`-compatible `{ error }` shape on
 * failure so server actions can early-return without rewriting their return
 * contracts.
 *
 * Always prefer this over raw `requireStaff()` in any action that touches
 * tenant-scoped tables.
 */
export type StaffTenantActionGuard = {
  ok: true;
  supabase: SupabaseClient;
  user: User;
  tenantId: string;
  tenantSlug: string;
};

export type StaffTenantActionGuardFail = { ok: false; error: string };

export async function requireStaffTenantAction(): Promise<
  StaffTenantActionGuard | StaffTenantActionGuardFail
> {
  const [auth, scope] = await Promise.all([requireStaff(), getTenantScope()]);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!scope) {
    return { ok: false, error: "No active tenant for this request." };
  }
  return {
    ok: true,
    supabase: auth.supabase,
    user: auth.user,
    tenantId: scope.tenantId,
    tenantSlug: scope.membership.slug,
  };
}

/**
 * Server-action guard for a user editing a talent profile they own.
 *
 * Auth model: the **ownership check** (`talent_profiles.user_id = current
 * user`) is the security boundary, not the user's `app_role`. A workspace
 * admin who is also rostered as talent on the same tenant (hybrid user)
 * must be able to edit their own profile — they're not a "talent role"
 * user but they ARE the owner of that profile row.
 *
 * Earlier this guard pre-checked `requireTalent()` (which gates on
 * `subjectRole === "talent"`) and rejected hybrid users with "Not
 * authorized" before the ownership query ever ran. The fix below skips
 * the role gate and lets the ownership check decide.
 *
 * Use this instead of `requireStaffTenantAction` in any action a talent
 * can invoke on their own profile (bio, languages, rates, etc.).
 */
export type TalentSelfActionGuard = {
  ok: true;
  supabase: SupabaseClient;
  user: User;
  tenantId: string;
  /** URL-safe profile code for scoping revalidatePath to /t/[profileCode]. */
  profileCode: string;
};

export async function requireTalentSelfAction(
  talent_profile_id: string,
): Promise<TalentSelfActionGuard | StaffTenantActionGuardFail> {
  const supabase = await getCachedServerSupabase();
  if (!supabase) return { ok: false, error: "Not configured." };

  const scope = await getTenantScope();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return { ok: false, error: "You must be signed in." };

  // Ownership check is the security boundary. profile_code is fetched
  // alongside id for the scoped revalidatePath call sites.
  const { data: tp, error } = await supabase
    .from("talent_profiles")
    .select("id, profile_code")
    .eq("id", talent_profile_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !tp) return { ok: false, error: "Not your profile." };

  let tenantId = scope?.tenantId ?? null;
  if (!tenantId) {
    const { data: rosterRow, error: rosterError } = await supabase
      .from("agency_talent_roster")
      .select("tenant_id")
      .eq("talent_profile_id", talent_profile_id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (rosterError || !rosterRow?.tenant_id) {
      return { ok: false, error: "Talent is not on any active roster." };
    }
    tenantId = rosterRow.tenant_id;
  }
  if (!tenantId) return { ok: false, error: "Talent is not on any active roster." };
  const resolvedTenantId = tenantId;

  return {
    ok: true,
    supabase,
    user,
    tenantId: resolvedTenantId,
    profileCode: (tp as { id: string; profile_code: string }).profile_code,
  };
}

/**
 * Pre-flight tenant-scoped existence check. Use from admin server actions that
 * receive an opaque row id via form data before delegating to shared helpers
 * (inquiry engine, booking engine) that themselves don't filter by tenant.
 *
 * Returns `true` if a row with `id = rowId AND tenant_id = tenantId` exists in
 * `tableName`. Callers should treat `false` as "not found for this tenant" and
 * refuse the request — do not leak whether the row exists in a different
 * tenant.
 */
export async function assertRowBelongsToTenant(
  supabase: SupabaseClient,
  tableName: "inquiries" | "agency_bookings" | "client_accounts",
  rowId: string,
  tenantId: string,
): Promise<boolean> {
  // SECURITY S1 (2026-05-19) — normalise both identifiers at the function
  // boundary and short-circuit on blank-after-trim. The previous guard
  // (`!rowId || !tenantId`) only rejected empty / falsy strings; a whitespace-
  // only id was truthy and issued a DB query with a junk equality filter.
  // That fails-closed today (no row matches "  "), but the input is
  // unnormalised and a future caller that .trim()s elsewhere could diverge.
  // Normalising here keeps the contract consistent and avoids the DB call.
  const trimmedRowId = typeof rowId === "string" ? rowId.trim() : "";
  const trimmedTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
  if (!trimmedRowId || !trimmedTenantId) return false;
  const { data } = await supabase
    .from(tableName)
    .select("id")
    .eq("id", trimmedRowId)
    .eq("tenant_id", trimmedTenantId)
    .maybeSingle();
  return !!data;
}

/**
 * Talent/client callers don't have `requireStaffTenantAction`'s tenant scope —
 * they're authenticated users acting on a specific inquiry. This helper
 * resolves the inquiry's tenant_id AND verifies the actor is an accepted (non-
 * declined/removed) participant in the given role. Returns `null` on either
 * failure path without leaking which condition blocked access.
 *
 * The inquiry's own tenant_id is authoritative — not the caller's host. That
 * prevents a talent/client signed into tenant A's host from escalating
 * actions on a tenant B inquiry they were somehow invited to.
 */
export async function resolveInquiryTenantForParticipant(
  supabase: SupabaseClient,
  userId: string,
  inquiryId: string,
  role: "talent" | "client",
): Promise<string | null> {
  if (!userId || !inquiryId) return null;

  if (role === "talent") {
    const { data: tp } = await supabase
      .from("talent_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!tp?.id) return null;
    const { data: part } = await supabase
      .from("inquiry_participants")
      .select("id, tenant_id, status")
      .eq("inquiry_id", inquiryId)
      .eq("talent_profile_id", tp.id)
      .eq("role", "talent")
      .maybeSingle();
    if (!part) return null;
    // SECURITY (fail-closed allow-list, not deny-list): the prior gate only
    // rejected "declined"/"removed", so an unrecognised state ("pending", "",
    // null, or any future status) silently RESOLVED — weaker than this
    // helper's "accepted participant" contract. Allow-list exactly the states
    // the rest of the system authorises for a participant: the DB RLS
    // policies consistently gate on `status IN ('invited','active')`
    // (see supabase/migrations/*phase2_inquiry_participants* et al.), so an
    // invited participant is *intentionally* in-scope (they were deliberately
    // added to this specific inquiry) — the hardening is that everything
    // OUTSIDE {invited, active} now fails closed instead of falling through.
    const PARTICIPANT_AUTHORISED_STATUSES = new Set(["invited", "active"]);
    if (!PARTICIPANT_AUTHORISED_STATUSES.has(part.status as string)) {
      return null;
    }
    return (part.tenant_id as string | null) ?? null;
  }

  // role === "client"
  const { data: inq } = await supabase
    .from("inquiries")
    .select("tenant_id, client_user_id")
    .eq("id", inquiryId)
    .eq("client_user_id", userId)
    .maybeSingle();
  if (!inq) return null;
  return (inq.tenant_id as string | null) ?? null;
}
