"use server";

/**
 * Talent apply-flow server actions (PR-F).
 *
 * Two flows, structurally identical:
 *   - submitAgencyApplication → talent_agency_applications
 *   - submitHubApplication    → talent_hub_applications
 *
 * Gates (re-checked here in addition to RLS WITH CHECK):
 *   - Talent must own the profile (requireTalentSelf).
 *   - Agency apply: target tenant must have accepts_open_applications=TRUE.
 *   - Hub apply: target tenant must have a kind='hub' agency_domains row.
 *   - Talent must not be under an active exclusive relationship
 *     (exclusivity_status IN ('confirmed','auto_assigned')).
 *
 * decideTalentApplication (staff): approve / reject a pending row. Approve
 * also puts the talent on the roster (approve-application.ts, TUL-1871).
 */

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { requireSession } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";
import { emitNotification, emitNotificationToUsers } from "@/lib/notifications/emit";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { userHasCapability } from "@/lib/access";
import { loadJoinTermsContext, proposeTermsOnJoin } from "@/lib/service-hub/join-terms.server";
import type { JoinTermsOutcome } from "@/lib/service-hub/join-terms";
import { proposeDefaultTermsAfterApprove } from "./propose-terms-after-approve";
import { getRequestLocale } from "@/i18n/request-locale";
import { afterResponse } from "@/lib/server/after-response";
import { checkRosterSeatAvailability } from "@/lib/saas/roster-seat-limit";
import { loadRegistrationSettings } from "@/lib/saas/registration-settings";
import { resolveExclusivityForRosterAdd } from "@/lib/agency/exclusivity-resolver";
import { notifyRosterJoinApproved } from "@/lib/notifications/producers/roster-join-notify";
import { rosterBlocksApply, type ExclusivityRosterRow } from "@/lib/talent/apply-exclusivity";
import {
  approveApplicationIntoRoster,
  type ApplicationTable,
  type ApproveLocale,
} from "./approve-application";

/** Look up profile_ids for all active staff of a tenant (owner/admin/coordinator). */
async function getStaffUserIds(tenantId: string): Promise<string[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("agency_memberships")
    .select("profile_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "coordinator"]);
  if (error) {
    logServerError("apply/staff_lookup", error);
    return [];
  }
  return ((data ?? []) as { profile_id: string }[]).map((r) => r.profile_id);
}

/** Look up user_id for a talent profile. */
async function getTalentUserId(talentProfileId: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("user_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("apply/talent_user_lookup", error);
    return null;
  }
  return (data as { user_id: string | null } | null)?.user_id ?? null;
}

type ApplyKind = "agency" | "hub";

export type SubmitApplicationResult =
  | { ok: true; applicationId: string }
  | { ok: false; code: ApplyErrorCode; error: string };

type ApplyErrorCode =
  | "not_authenticated"
  | "talent_profile_not_found"
  | "target_not_found"
  | "target_not_open"
  | "target_not_hub"
  | "exclusivity_block"
  | "duplicate_pending"
  | "db_error";

export type DecideApplicationResult =
  | { ok: true; applicationId: string; newStatus: "approved" | "rejected"; terms?: JoinTermsOutcome }
  | { ok: false; code: "not_authenticated" | "not_staff" | "not_found" | "already_decided" | "seat_limit" | "db_error"; error: string };

function tableFor(kind: ApplyKind): string {
  return kind === "agency"
    ? "talent_agency_applications"
    : "talent_hub_applications";
}

async function commonGate(
  kind: ApplyKind,
  targetTenantId: string,
): Promise<{ ok: true } | { ok: false; code: ApplyErrorCode; error: string }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, code: "db_error", error: "Supabase unavailable." };

  if (kind === "agency") {
    const { data, error } = await supabase
      .from("agencies")
      .select("id, accepts_open_applications")
      .eq("id", targetTenantId)
      .maybeSingle();
    if (error) {
      logServerError("apply/agency_target_lookup", error);
      return { ok: false, code: "db_error", error: error.message };
    }
    if (!data) return { ok: false, code: "target_not_found", error: "Agency not found." };
    if (!(data as { accepts_open_applications: boolean }).accepts_open_applications) {
      return { ok: false, code: "target_not_open", error: "This agency isn't accepting applications right now." };
    }
  } else {
    const { data, error } = await supabase
      .from("agency_domains")
      .select("tenant_id, kind")
      .eq("tenant_id", targetTenantId)
      .eq("kind", "hub")
      .maybeSingle();
    if (error) {
      logServerError("apply/hub_target_lookup", error);
      return { ok: false, code: "db_error", error: error.message };
    }
    if (!data) return { ok: false, code: "target_not_hub", error: "This tenant is not a hub." };
  }

  return { ok: true };
}

async function exclusivityGate(
  talentProfileId: string,
  targetTenantId: string,
): Promise<{ ok: true } | { ok: false; code: "exclusivity_block" | "db_error"; error: string }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, code: "db_error", error: "Supabase unavailable." };

  const { data, error } = await supabase
    .from("agency_talent_roster")
    .select("tenant_id, is_primary, status, exclusivity_status")
    .eq("talent_profile_id", talentProfileId)
    .eq("is_primary", true)
    .in("exclusivity_status", ["confirmed", "auto_assigned"])
    .not("status", "in", "(removed,rejected)");
  if (error) {
    logServerError("apply/exclusivity_check", error);
    return { ok: false, code: "db_error", error: error.message };
  }
  if (rosterBlocksApply((data ?? []) as ExclusivityRosterRow[], targetTenantId)) {
    return {
      ok: false,
      code: "exclusivity_block",
      error: "You're currently in an exclusive relationship — apply is disabled until that ends.",
    };
  }
  return { ok: true };
}

async function submitApplication(
  kind: ApplyKind,
  targetTenantId: string,
  message?: string,
): Promise<SubmitApplicationResult> {
  const guard = await requireTalentSelf();
  if (!guard.ok) {
    if (guard.code === "not_authenticated") {
      return { ok: false, code: "not_authenticated", error: guard.error };
    }
    return { ok: false, code: "talent_profile_not_found", error: guard.error };
  }

  const targetGate = await commonGate(kind, targetTenantId);
  if (!targetGate.ok) return targetGate;

  const exclGate = await exclusivityGate(guard.talentProfile.id, targetTenantId);
  if (!exclGate.ok) return exclGate;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, code: "db_error", error: "Supabase unavailable." };

  const { data, error } = await supabase
    .from(tableFor(kind))
    .insert({
      tenant_id: targetTenantId,
      talent_profile_id: guard.talentProfile.id,
      submitted_by_user_id: guard.session.user.id,
      message: message?.trim() || null,
    })
    .select("id")
    .single();

  if (error) {
    // Unique partial index → duplicate pending.
    if (error.code === "23505") {
      return { ok: false, code: "duplicate_pending", error: "You already have a pending application here." };
    }
    logServerError("apply/insert", error);
    return { ok: false, code: "db_error", error: error.message };
  }

  // Notify workspace staff of the new application — best-effort, non-critical.
  void (async () => {
    const staffIds = await getStaffUserIds(targetTenantId);
    await emitNotificationToUsers(staffIds, {
      tenantId: targetTenantId,
      kind: "approval",
      surface: "workspace",
      title: "New roster application",
      body: `${guard.talentProfile.displayName ?? "A talent"} applied to join your roster.`,
      targetDrawer: "roster-applications",
    });
  })();

  // Revalidate the talent's My Site so the application appears under
  // "Where you appear" / agency status.
  revalidatePath("/talent/site");
  return { ok: true, applicationId: (data as { id: string }).id };
}

/** Submit an open-application to an agency. */
export async function submitAgencyApplication(
  targetTenantId: string,
  message?: string,
): Promise<SubmitApplicationResult> {
  await requireNotImpersonating();
  return submitApplication("agency", targetTenantId, message);
}

/** Submit an open-application to a hub. */
export async function submitHubApplication(
  targetTenantId: string,
  message?: string,
): Promise<SubmitApplicationResult> {
  await requireNotImpersonating();
  return submitApplication("hub", targetTenantId, message);
}

/**
 * Staff approve/reject a pending application (TUL-1871 / TUL-1368).
 *
 * Gated on `manage_talent_roster` for the application's workspace (never a capability-less staff
 * guard). Approve is one flow: the application is claimed (pending -> approved, once), the talent
 * lands on the workspace roster as an active row, the plan seat cap is respected (over the cap the
 * approve is refused with a clear message and the application stays pending), and the talent is
 * told. See approve-application.ts for the ordering and the double-click guarantees.
 */
export async function decideTalentApplication(
  kind: ApplyKind,
  applicationId: string,
  decision: "approved" | "rejected",
  decisionNote?: string,
): Promise<DecideApplicationResult> {
  await requireNotImpersonating();
  const session = await requireSession();
  if (!session.ok) {
    return { ok: false, code: "not_authenticated", error: session.error };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, code: "db_error", error: "Supabase unavailable." };
  const locale: ApproveLocale = (await getRequestLocale()) === "es" ? "es" : "en";

  // Read the row first so we can return a helpful error and so the
  // RLS staff-update gate is exercised before the write.
  const { data: row, error: readError } = await supabase
    .from(tableFor(kind))
    .select("id, tenant_id, status, talent_profile_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (readError) {
    logServerError("apply/decide_read", readError);
    return { ok: false, code: "db_error", error: readError.message };
  }
  if (!row) return { ok: false, code: "not_found", error: "Application not found or not visible." };
  const r = row as { id: string; tenant_id: string; status: string; talent_profile_id: string };

  if (!(await userHasCapability("manage_talent_roster", r.tenant_id))) {
    return {
      ok: false,
      code: "not_staff",
      error: locale === "es" ? "No tienes permiso para resolver solicitudes." : "You don't have permission to decide applications.",
    };
  }
  // An application approved earlier whose roster row never landed can be approved again to repair it.
  const repairApproved = decision === "approved" && r.status === "approved";
  if (r.status !== "pending" && !repairApproved) {
    return { ok: false, code: "already_decided", error: `Already ${r.status}.` };
  }

  const note = decisionNote?.trim() || null;
  let terms: JoinTermsOutcome = "skipped";
  if (decision === "approved") {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, code: "db_error", error: "Service unavailable." };
    const settings = await loadRegistrationSettings(r.tenant_id);
    const outcome = await approveApplicationIntoRoster(
      admin,
      {
        table: tableFor(kind) as ApplicationTable,
        applicationId,
        tenantId: r.tenant_id,
        talentProfileId: r.talent_profile_id,
        userId: session.user.id,
        note,
        locale,
      },
      {
        defaultVisibility: settings.defaultRosterVisibility,
        checkSeat: async (tenantId) => {
          const seat = await checkRosterSeatAvailability(admin, tenantId, 1);
          return seat.ok ? { ok: true } : { ok: false, limit: seat.limit };
        },
        resolveExclusivity: async (tenantId, talentProfileId) =>
          settings.mode === "exclusive" ? resolveExclusivityForRosterAdd(admin, tenantId, talentProfileId) : null,
      },
    );
    if (!outcome.ok) {
      if (outcome.code === "db_error") logServerError("apply/decide_approve", new Error(outcome.error));
      return { ok: false, code: outcome.code, error: outcome.error };
    }
    // TUL-1368: the talent joined, so the workspace's terms go to them (their terms card).
    // Awaited: the card must exist when the owner's page refreshes. Never fails the approve.
    terms = await proposeDefaultTermsAfterApprove(
      { tenantId: r.tenant_id, talentProfileId: r.talent_profile_id, userId: session.user.id, rosterAdded: outcome.rosterAdded },
      {
        hasPendingTerms: async (tenantId, talentProfileId) => {
          const { data, error } = await admin
            .from("workspace_talent_terms")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("talent_profile_id", talentProfileId)
            .eq("status", "pending")
            .limit(1);
          return !error && (data ?? []).length > 0;
        },
        loadContext: (tenantId, userId) => loadJoinTermsContext(admin, tenantId, userId),
        propose: async ({ tenantId, talentProfileId, input, defaultModel }) =>
          proposeTermsOnJoin(await createSupabaseServerClient(), { tenantId, talentProfileId, path: "discover_join", input, defaultModel }),
      },
    );
    if (outcome.rosterAdded) {
      afterResponse(() => notifyRosterJoinApproved({ admin, tenantId: r.tenant_id, talentProfileId: r.talent_profile_id }));
    }
  } else {
    // Conditional on pending, so a double click or a second admin cannot decide twice.
    const { data: flipped, error: updateError } = await supabase
      .from(tableFor(kind))
      .update({
        status: decision,
        decision_note: note,
        decided_by_user_id: session.user.id,
        decided_at: new Date().toISOString(),
      })
      .eq("id", applicationId)
      .eq("status", "pending")
      .select("id");
    if (updateError) {
      logServerError("apply/decide_update", updateError);
      return { ok: false, code: "db_error", error: updateError.message };
    }
    if ((flipped ?? []).length === 0) {
      return { ok: false, code: "already_decided", error: "Already decided." };
    }
  }

  // Notify the talent about the decision (in app), best-effort.
  void (async () => {
    const talentUserId = await getTalentUserId(r.talent_profile_id);
    if (talentUserId) {
      await emitNotification({
        userId: talentUserId,
        tenantId: r.tenant_id,
        kind: "approval",
        surface: "talent",
        title: decision === "approved" ? "Application approved!" : "Application update",
        body: decision === "approved"
          ? "Your application was approved. You are now on the roster."
          : "Your application wasn't approved this time. You can apply to other agencies anytime.",
        targetDrawer: "talent-reach",
      });
    }
  })();

  revalidatePath("/talent/site");
  // The roster, People and Applications pages (and the admin layout that feeds them) must not
  // serve the pre-approval roster.
  revalidatePath("/[tenantSlug]/admin", "layout");
  revalidatePath("/[tenantSlug]/admin/roster", "page");
  revalidatePath("/[tenantSlug]/admin/people", "page");
  revalidatePath("/talent", "layout");
  return { ok: true, applicationId, newStatus: decision, terms };
}

/** Talent self-service withdraw of own pending application. */
export async function withdrawOwnApplication(
  kind: ApplyKind,
  applicationId: string,
): Promise<{ ok: true } | { ok: false; code: "not_authenticated" | "not_found" | "db_error"; error: string }> {
  await requireNotImpersonating();
  const guard = await requireTalentSelf();
  if (!guard.ok) {
    return { ok: false, code: guard.code === "not_authenticated" ? "not_authenticated" : "not_found", error: guard.error };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, code: "db_error", error: "Supabase unavailable." };

  const { error } = await supabase
    .from(tableFor(kind))
    .update({ status: "withdrawn" })
    .eq("id", applicationId)
    .eq("talent_profile_id", guard.talentProfile.id);

  if (error) {
    logServerError("apply/withdraw", error);
    return { ok: false, code: "db_error", error: error.message };
  }
  return { ok: true };
}

export type OwnApplicationRow = {
  id: string;
  kind: ApplyKind;
  status: string;
  tenantId: string;
  createdAt: string | null;
};

/** Talent's own agency and hub applications. Same tables. No parallel model. */
export async function listOwnApplications(): Promise<
  { ok: true; items: OwnApplicationRow[] } | { ok: false; error: string }
> {
  const guard = await requireTalentSelf();
  if (!guard.ok) return { ok: false, error: guard.error };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Supabase unavailable." };

  const [agencies, hubs] = await Promise.all([
    supabase
      .from("talent_agency_applications")
      .select("id, tenant_id, status, created_at")
      .eq("talent_profile_id", guard.talentProfile.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("talent_hub_applications")
      .select("id, tenant_id, status, created_at")
      .eq("talent_profile_id", guard.talentProfile.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (agencies.error) {
    logServerError("apply/list_own_agency", agencies.error);
    return { ok: false, error: agencies.error.message };
  }
  if (hubs.error) {
    logServerError("apply/list_own_hub", hubs.error);
    return { ok: false, error: hubs.error.message };
  }
  const items: OwnApplicationRow[] = [
    ...((agencies.data ?? []) as Array<{ id: string; tenant_id: string; status: string; created_at: string | null }>).map((row) => ({
      id: row.id,
      kind: "agency" as const,
      status: row.status,
      tenantId: row.tenant_id,
      createdAt: row.created_at,
    })),
    ...((hubs.data ?? []) as Array<{ id: string; tenant_id: string; status: string; created_at: string | null }>).map((row) => ({
      id: row.id,
      kind: "hub" as const,
      status: row.status,
      tenantId: row.tenant_id,
      createdAt: row.created_at,
    })),
  ];
  return { ok: true, items };
}
