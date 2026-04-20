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
};

export type StaffTenantActionGuardFail = { ok: false; error: string };

export async function requireStaffTenantAction(): Promise<
  StaffTenantActionGuard | StaffTenantActionGuardFail
> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await getTenantScope();
  if (!scope) {
    return { ok: false, error: "No active tenant for this request." };
  }
  return {
    ok: true,
    supabase: auth.supabase,
    user: auth.user,
    tenantId: scope.tenantId,
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
  if (!rowId || !tenantId) return false;
  const { data } = await supabase
    .from(tableName)
    .select("id")
    .eq("id", rowId)
    .eq("tenant_id", tenantId)
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
    if (part.status === "declined" || part.status === "removed") return null;
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
