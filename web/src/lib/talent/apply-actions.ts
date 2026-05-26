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
 * decideTalentApplication (staff): approve / reject a pending row. Re-uses
 * the existing roster-add server path for approvals so an approved talent
 * automatically lands on the agency's roster — no parallel insert path.
 */

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { requireSession } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";

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
  | { ok: true; applicationId: string; newStatus: "approved" | "rejected" }
  | { ok: false; code: "not_authenticated" | "not_staff" | "not_found" | "already_decided" | "db_error"; error: string };

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
): Promise<{ ok: true } | { ok: false; code: "exclusivity_block" | "db_error"; error: string }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, code: "db_error", error: "Supabase unavailable." };

  const { data, error } = await supabase
    .from("agency_talent_roster")
    .select("id, status, exclusivity_status")
    .eq("talent_profile_id", talentProfileId)
    .in("exclusivity_status", ["confirmed", "auto_assigned"])
    .not("status", "in", "(removed,rejected)");
  if (error) {
    logServerError("apply/exclusivity_check", error);
    return { ok: false, code: "db_error", error: error.message };
  }
  if ((data ?? []).length > 0) {
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

  const exclGate = await exclusivityGate(guard.talentProfile.id);
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
  return submitApplication("agency", targetTenantId, message);
}

/** Submit an open-application to a hub. */
export async function submitHubApplication(
  targetTenantId: string,
  message?: string,
): Promise<SubmitApplicationResult> {
  return submitApplication("hub", targetTenantId, message);
}

/**
 * Staff approve/reject a pending application. Approval transitions
 * status='approved' on the row and (for agency apply) ALSO inserts a
 * roster row through the existing add-talent path. The roster add is
 * done in the agency-side handler later — for now this action just
 * flips the status.
 */
export async function decideTalentApplication(
  kind: ApplyKind,
  applicationId: string,
  decision: "approved" | "rejected",
  decisionNote?: string,
): Promise<DecideApplicationResult> {
  const session = await requireSession();
  if (!session.ok) {
    return { ok: false, code: "not_authenticated", error: session.error };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, code: "db_error", error: "Supabase unavailable." };

  // Read the row first so we can return a helpful error and so the
  // RLS staff-update gate is exercised before the write.
  const { data: row, error: readError } = await supabase
    .from(tableFor(kind))
    .select("id, tenant_id, status")
    .eq("id", applicationId)
    .maybeSingle();
  if (readError) {
    logServerError("apply/decide_read", readError);
    return { ok: false, code: "db_error", error: readError.message };
  }
  if (!row) return { ok: false, code: "not_found", error: "Application not found or not visible." };
  const r = row as { id: string; tenant_id: string; status: string };
  if (r.status !== "pending") {
    return { ok: false, code: "already_decided", error: `Already ${r.status}.` };
  }

  const { error: updateError } = await supabase
    .from(tableFor(kind))
    .update({
      status: decision,
      decision_note: decisionNote?.trim() || null,
      decided_by_user_id: session.user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", applicationId);

  if (updateError) {
    logServerError("apply/decide_update", updateError);
    return { ok: false, code: "db_error", error: updateError.message };
  }

  return { ok: true, applicationId, newStatus: decision };
}

/** Talent self-service withdraw of own pending application. */
export async function withdrawOwnApplication(
  kind: ApplyKind,
  applicationId: string,
): Promise<{ ok: true } | { ok: false; code: "not_authenticated" | "not_found" | "db_error"; error: string }> {
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
