"use server";

/**
 * Server actions for the Roster · Registration settings page.
 *
 * saveRegistrationSettings — upserts the tenant's tenant_registration_settings
 * row (the "Open for registration" policy). Manager+ only (manage_talent_roster
 * capability). The chosen mode is re-validated against the workspace plan
 * server-side, so a tampered client can't unlock Exclusive on a Free plan.
 *
 * Keeps agencies.accepts_open_applications in sync (true when registration is
 * live, i.e. enabled AND not closed) so the legacy Applications surface and the
 * new engine never contradict each other.
 */

import { revalidatePath } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { requireSession } from "@/lib/server/action-guards";
import { userHasCapability } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";
import {
  isRegistrationModeAllowed,
  type RegistrationMode,
} from "@/lib/access/registration-modes";
import {
  loadRegistrationSettings,
  type RosterVisibility,
} from "@/lib/saas/registration-settings";
import { resolveExclusivityForRosterAdd } from "@/lib/agency/exclusivity-resolver";
import {
  notifyRosterJoinApproved,
  notifyRosterJoinRejected,
} from "@/lib/notifications/producers/roster-join-notify";

export type SaveRegistrationSettingsInput = {
  enabled: boolean;
  mode: RegistrationMode;
  defaultRosterVisibility: RosterVisibility;
  ctaLabel: string;
};

export type SaveRegistrationSettingsResult =
  | { ok: true }
  | { ok: false; error: string };

function cleanLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "Join the team";
  return trimmed.slice(0, 60);
}

export async function saveRegistrationSettings(
  tenantSlug: string,
  input: SaveRegistrationSettingsInput,
): Promise<SaveRegistrationSettingsResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: "Please sign in again." };

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };

  const canManage = await userHasCapability("manage_talent_roster", scope.tenantId);
  if (!canManage) {
    return { ok: false, error: "You don't have permission to change this setting." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service unavailable." };

  // Re-read the plan server-side and validate the mode against it.
  const { data: agency, error: agencyError } = await admin
    .from("agencies")
    .select("plan_tier, kind")
    .eq("id", scope.tenantId)
    .maybeSingle();
  if (agencyError || !agency) {
    if (agencyError) logServerError("registration/save.plan", agencyError);
    return { ok: false, error: "Couldn't read your plan. Please try again." };
  }

  const planTier = String(agency.plan_tier ?? "free");
  const kind = agency.kind === "hub" ? "hub" : "agency";
  if (!isRegistrationModeAllowed(planTier, input.mode, kind)) {
    return {
      ok: false,
      error: "That mode isn't available on your current plan.",
    };
  }

  const ctaLabel = cleanLabel(input.ctaLabel);
  const { error: upsertError } = await admin
    .from("tenant_registration_settings")
    .upsert(
      {
        tenant_id: scope.tenantId,
        enabled: input.enabled,
        mode: input.mode,
        default_roster_visibility: input.defaultRosterVisibility,
        cta_label: ctaLabel,
        updated_by: auth.user.id,
      },
      { onConflict: "tenant_id" },
    );
  if (upsertError) {
    logServerError("registration/save.upsert", upsertError);
    return { ok: false, error: upsertError.message };
  }

  // Keep the legacy open-applications flag consistent with the engine state.
  const registrationLive = input.enabled && input.mode !== "closed";
  const { error: syncError } = await admin
    .from("agencies")
    .update({ accepts_open_applications: registrationLive })
    .eq("id", scope.tenantId);
  if (syncError) {
    // Non-fatal: the engine row is the source of truth; log and continue.
    logServerError("registration/save.syncAcceptsOpen", syncError);
  }

  revalidatePath(`/${tenantSlug}/admin/roster/registration`);
  revalidatePath(`/${tenantSlug}/admin/roster/applications`);
  return { ok: true };
}

export type DecideJoinRequestResult = { ok: true } | { ok: false; error: string };

/**
 * Approve or decline a pending roster join request (Manager+). Approve flips the
 * row to active and, when the workspace is in exclusive mode, applies the
 * single-exclusive-agency rule via resolveExclusivityForRosterAdd (talent then
 * confirms via their exclusivity-prompt inbox). Decline soft-removes the row.
 */
export async function decideJoinRequest(
  tenantSlug: string,
  rosterRowId: string,
  decision: "approve" | "reject",
): Promise<DecideJoinRequestResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: "Please sign in again." };

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };

  const canManage = await userHasCapability("manage_talent_roster", scope.tenantId);
  if (!canManage) {
    return { ok: false, error: "You don't have permission to review requests." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service unavailable." };

  const { data: row, error: rowError } = await admin
    .from("agency_talent_roster")
    .select("id, tenant_id, talent_profile_id, status")
    .eq("id", rosterRowId)
    .maybeSingle();
  if (rowError || !row) return { ok: false, error: "Request not found." };
  if (row.tenant_id !== scope.tenantId) return { ok: false, error: "Request not found." };
  if (row.status !== "pending") {
    return { ok: false, error: "This request was already handled." };
  }
  const talentProfileId = row.talent_profile_id as string;

  if (decision === "reject") {
    const { error } = await admin
      .from("agency_talent_roster")
      .update({
        status: "removed",
        removed_at: new Date().toISOString(),
        removed_by: auth.user.id,
      })
      .eq("id", rosterRowId);
    if (error) {
      logServerError("registration/decide.reject", error);
      return { ok: false, error: error.message };
    }
    void notifyRosterJoinRejected({ admin, tenantId: scope.tenantId, talentProfileId });
    revalidatePath(`/${tenantSlug}/admin/roster/registration`);
    return { ok: true };
  }

  // Approve → active, with exclusivity when the workspace is in exclusive mode.
  const settings = await loadRegistrationSettings(scope.tenantId);
  const update: Record<string, unknown> = {
    status: "active",
    agency_visibility: settings.defaultRosterVisibility,
  };
  if (settings.mode === "exclusive") {
    const ex = await resolveExclusivityForRosterAdd(
      admin,
      scope.tenantId,
      talentProfileId,
    );
    if (ex.shouldBeExclusive) {
      update.is_primary = true;
      update.exclusivity_status = ex.exclusivityStatus;
      update.exclusivity_auto_assigned_at = ex.autoAssignedAt;
    }
  }
  const { error } = await admin
    .from("agency_talent_roster")
    .update(update)
    .eq("id", rosterRowId);
  if (error) {
    logServerError("registration/decide.approve", error);
    return { ok: false, error: error.message };
  }
  void notifyRosterJoinApproved({ admin, tenantId: scope.tenantId, talentProfileId });
  revalidatePath(`/${tenantSlug}/admin/roster/registration`);
  return { ok: true };
}
