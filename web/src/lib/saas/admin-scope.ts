import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { requireSession } from "@/lib/server/action-guards";
import { userHasCapability, type CapabilityKey } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
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
 * Server-action guard: authenticates the caller as an authorised MEMBER of the
 * active tenant AND resolves that tenant. Returns an `AdminActionState`-
 * compatible `{ error }` shape on failure so server actions can early-return
 * without rewriting their return contracts.
 *
 * Always prefer this over raw `requireSession()` in any action that touches
 * tenant-scoped tables.
 *
 * AUTH MODEL (2026-08-04 sweep, extends PR #990):
 * This guard used to be `requireStaff() + getTenantScope()`. `requireStaff`
 * checks the GLOBAL `profiles.app_role` (`super_admin` | `agency_staff`), which
 * rejects **hybrid workspace owners** — a talent/client-signup user who creates
 * or is granted a workspace keeps `app_role='talent'`/`'client'` (see
 * `workspace-lifecycle.ts`; that is a supported product state). The workspace
 * admin shell admits them through the membership-based `agency.workspace.view`
 * capability, so every action behind this guard rendered but returned
 * "Not authorized." on their own workspace.
 *
 * Authorization is now proven by three independent, membership-based layers —
 * no global role anywhere:
 *   (a) `getTenantScope()` fails CLOSED: it walks `agency_memberships` and
 *       returns null unless the caller holds a row on the resolved tenant (a
 *       tampered `impronta.active_tenant_id` cookie is rejected + logged);
 *   (b) the capability check below runs the canonical 10-step resolver
 *       (`userHasCapability`), which requires an **active** membership whose
 *       ROLE grants the capability, on a servable tenant. Platform admins
 *       (`super_admin`) bypass via the platform-role step, so HQ flows are
 *       unaffected;
 *   (c) RLS — `is_staff_of_tenant()` is membership-based, not app_role-based,
 *       so the database boundary is unchanged by this swap.
 *
 * Net effect on the gate: hybrid owners are admitted (the bug), and
 * `pending_acceptance` members are now *rejected* for mutations (step (b)
 * requires `status='active'`) — a tightening the capability model already
 * documented but the old global-role gate never enforced.
 *
 * @param options.capability Membership-role capability the caller must hold on
 *   the resolved tenant. Defaults to `agency.workspace.view` (the same gate the
 *   workspace admin shell uses to admit the caller at all — every membership
 *   role from `viewer` up holds it). Pass a narrower capability from actions
 *   that mutate admin-grade surfaces so the guard grades up with the action
 *   instead of relying on RLS alone.
 */
export type StaffTenantActionGuard = {
  ok: true;
  supabase: SupabaseClient;
  user: User;
  tenantId: string;
  tenantSlug: string;
};

export type StaffTenantActionGuardFail = { ok: false; error: string };

export async function requireStaffTenantAction(options?: {
  capability?: CapabilityKey;
}): Promise<StaffTenantActionGuard | StaffTenantActionGuardFail> {
  const [auth, scope] = await Promise.all([requireSession(), getTenantScope()]);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!scope) {
    return { ok: false, error: "No active tenant for this request." };
  }
  // Membership-role capability check (see AUTH MODEL above). `getTenantScope`
  // already proved a membership row exists; this proves the membership is
  // ACTIVE and its role actually grants the requested surface.
  const capability: CapabilityKey = options?.capability ?? "agency.workspace.view";
  if (!(await userHasCapability(capability, scope.tenantId))) {
    return { ok: false, error: "Not authorized." };
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
 * Server-action guard for ANY active coordinator of a specific inquiry —
 * staff OR a roster talent appointed as coordinator (pov 'talent_coord').
 *
 * Same shape as requireStaffTenantAction plus an `isStaff` discriminator, so
 * coordinator actions swap the gate with no other change. The returned
 * `supabase` is ALWAYS the caller's user-scoped session client, so actor-gated
 * RPCs (engine_convert_to_booking, RLS writes) run under the coordinator's own
 * auth.uid() — never service-role.
 *
 * Resolution: 1) try requireStaffTenantAction; if staff-on-this-tenant AND the
 * inquiry belongs to that tenant (assertRowBelongsToTenant), return isStaff:true.
 * 2) else authorize via an ACTIVE role='coordinator' participant row on THIS
 * inquiry (RLS-readable via inquiry_participants_own_coordinator_select), take
 * tenant_id from that row, resolve tenantSlug via a service-role agencies.slug
 * read, return isStaff:false. Fails closed otherwise.
 */
export type InquiryManagerActionGuard = {
  ok: true;
  supabase: SupabaseClient;
  user: User;
  tenantId: string;
  tenantSlug: string;
  /** true = agency staff on this tenant; false = appointed coordinator
   *  (incl. a talent coordinator) acting on this single inquiry. */
  isStaff: boolean;
};

export async function requireInquiryManagerAction(
  inquiryId: string,
): Promise<InquiryManagerActionGuard | StaffTenantActionGuardFail> {
  const trimmedInquiryId = typeof inquiryId === "string" ? inquiryId.trim() : "";
  if (!trimmedInquiryId) return { ok: false, error: "Missing inquiry." };

  // 1. Staff fast-path (cross-tenant-safe).
  const staff = await requireStaffTenantAction();
  if (staff.ok) {
    const belongs = await assertRowBelongsToTenant(
      staff.supabase,
      "inquiries",
      trimmedInquiryId,
      staff.tenantId,
    );
    if (belongs) {
      return {
        ok: true,
        supabase: staff.supabase,
        user: staff.user,
        tenantId: staff.tenantId,
        tenantSlug: staff.tenantSlug,
        isStaff: true,
      };
    }
    // Staff, but inquiry is in another tenant → fall through to the
    // coordinator path (don't escalate or leak).
  }

  // 2. Coordinator path — under the user's own session client.
  const supabase = await getCachedServerSupabase();
  if (!supabase) return { ok: false, error: "Not configured." };

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return { ok: false, error: "You must be signed in." };

  // Readable via inquiry_participants_own_coordinator_select
  // (user_id = auth.uid() AND role = 'coordinator'). The unique index
  // (inquiry_id,user_id,role) WHERE user_id IS NOT NULL guarantees ≤1 row.
  const { data: coordRow } = await supabase
    .from("inquiry_participants")
    .select("tenant_id, status")
    .eq("inquiry_id", trimmedInquiryId)
    .eq("user_id", user.id)
    .eq("role", "coordinator")
    .maybeSingle();

  if (!coordRow || coordRow.status !== "active") {
    return { ok: false, error: "You are not the coordinator of this inquiry." };
  }
  const tenantId = (coordRow.tenant_id as string | null) ?? null;
  if (!tenantId) return { ok: false, error: "Coordinator assignment is missing a tenant." };

  // tenantSlug via service-role (talent has no membership). Read-only slug
  // lookup, NOT a data path — all mutations run on `supabase` (user client).
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const { data: agency } = await admin
    .from("agencies")
    .select("slug")
    .eq("id", tenantId)
    .maybeSingle();
  const tenantSlug = (agency?.slug as string | null) ?? null;
  if (!tenantSlug) return { ok: false, error: "Could not resolve workspace for this inquiry." };

  return { ok: true, supabase, user, tenantId, tenantSlug, isStaff: false };
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
  /**
   * Tenant the talent is editing under, or `null` for an INDEPENDENT talent
   * who self-registered (via /talent/register) and is not on any agency
   * roster. Tenant only scopes agency-managed fields (internal notes, field
   * locks, directory feature flag); the talent's own profile data is keyed by
   * talent_profile_id and loads/saves regardless. Consumers that touch
   * agency-scoped rows must handle `null` (skip / no-op for independent talent).
   */
  tenantId: string | null;
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

  // Resolve the tenant the talent is editing under, if any. Order of
  // preference: the host's tenant scope → an active roster row. An
  // INDEPENDENT talent who self-registered (via /talent/register) is on no
  // roster and has no tenant — that is NOT an error. They own their profile
  // (verified above by user_id) and can edit it; tenantId stays null and
  // agency-scoped reads/writes no-op for them.
  let tenantId = scope?.tenantId ?? null;
  if (!tenantId) {
    const { data: rosterRow } = await supabase
      .from("agency_talent_roster")
      .select("tenant_id")
      .eq("talent_profile_id", talent_profile_id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    tenantId = rosterRow?.tenant_id ?? null;
  }

  return {
    ok: true,
    supabase,
    user,
    tenantId,
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
