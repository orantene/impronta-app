"use server";

import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { revalidatePath } from "next/cache";
import type { ServerActionResult } from "./result";

/**
 * F.8 — Talent profile change request review actions.
 *
 * The talent edits their profile → instead of writing live the changes
 * land in talent_profile_change_requests as `status='pending'`. Agency
 * admin reviews the queue and accepts / rejects in bulk or one-at-a-
 * time. Acceptance applies the JSONB changes to talent_profiles.
 *
 * Whitelist of fields that the talent is allowed to propose self-edits
 * on. Other edits stay direct-write (or are server-action gated).
 */
const ALLOWED_FIELDS = new Set<string>([
  "display_name",
  "first_name",
  "last_name",
  "short_bio",
  "bio_en",
  "bio_es",
  "phone",
  "height_cm",
  "location_id",
  "home_city_text",
  "date_of_birth",
  "gender",
]);

export type SubmitProfileChangeInput = {
  talentProfileId: string;
  /** Proposed values keyed by column name. Unknown keys are rejected. */
  changes: Record<string, unknown>;
  /** Optional rationale shown to the agency reviewer. */
  note?: string;
};

/**
 * Talent-self submit: open a pending change request. Used by the
 * profile editor when the tenant has require_profile_change_review
 * enabled. Strips unknown keys + snapshots prior values for the diff.
 */
export async function submitProfileChangeRequest(
  input: SubmitProfileChangeInput,
): Promise<ServerActionResult<{ requestId: string }>> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable.", reason: "unexpected" };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sign in first.", reason: "unauthenticated" };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    // Filter to allowed keys; drop unknowns.
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input.changes)) {
      if (ALLOWED_FIELDS.has(k)) filtered[k] = v;
    }
    if (Object.keys(filtered).length === 0) {
      return { ok: false, error: "No reviewable fields in your changes.", reason: "validation_failed" };
    }

    // Look up the profile + verify ownership + grab the tenant.
    const { data: talent } = await admin
      .from("talent_profiles")
      .select(`id, user_id, ${Array.from(ALLOWED_FIELDS).join(", ")}`)
      .eq("id", input.talentProfileId)
      .maybeSingle();
    if (!talent) return { ok: false, error: "Profile not found.", reason: "not_found" };
    if ((talent as { user_id?: string | null }).user_id !== user.id) {
      return { ok: false, error: "Not your profile.", reason: "forbidden" };
    }

    // Find the tenant via active roster row (talent_profiles itself has
    // no tenant_id — it's many-to-many via agency_talent_roster).
    const { data: roster } = await admin
      .from("agency_talent_roster")
      .select("tenant_id")
      .eq("talent_profile_id", input.talentProfileId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    const tenantId = (roster as { tenant_id?: string } | null)?.tenant_id;
    if (!tenantId) {
      return { ok: false, error: "No active agency for this profile.", reason: "forbidden" };
    }

    // Build the previous-values snapshot for the diff preview.
    const previous: Record<string, unknown> = {};
    const talentMap = talent as unknown as Record<string, unknown>;
    for (const k of Object.keys(filtered)) {
      previous[k] = talentMap[k] ?? null;
    }

    // Supersede any prior pending request from this user on this profile
    // — only the latest pending is meaningful.
    await admin
      .from("talent_profile_change_requests")
      .update({
        status: "superseded",
        decided_at: new Date().toISOString(),
        decision_note: "Superseded by newer submission.",
      })
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", input.talentProfileId)
      .eq("status", "pending");

    const { data: created, error: insertErr } = await admin
      .from("talent_profile_change_requests")
      .insert({
        tenant_id: tenantId,
        talent_profile_id: input.talentProfileId,
        submitted_by_user_id: user.id,
        changes: filtered,
        previous_values: previous,
        decision_note: input.note?.trim() || null,
      })
      .select("id")
      .single();

    if (insertErr || !created) {
      logServerError("profile-change-requests.submit", insertErr);
      return { ok: false, error: "Couldn't submit changes.", reason: "unexpected" };
    }

    revalidatePath("/", "layout");
    return { ok: true, data: { requestId: (created as { id: string }).id } };
  } catch (err) {
    logServerError("profile-change-requests.submit", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}

/**
 * Agency-staff accept: apply the changes to talent_profiles + mark
 * the request accepted. Supports bulk via accepting an array of IDs.
 */
export async function acceptProfileChangeRequests(
  requestIds: string[],
): Promise<ServerActionResult<{ accepted: number; failed: number }>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    const { tenantId, user } = auth;

    if (requestIds.length === 0) {
      return { ok: false, error: "Pick at least one request.", reason: "validation_failed" };
    }

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    const { data: rows } = await admin
      .from("talent_profile_change_requests")
      .select("id, talent_profile_id, changes, status")
      .in("id", requestIds)
      .eq("tenant_id", tenantId)
      .eq("status", "pending");

    let accepted = 0;
    let failed = 0;
    const decidedAt = new Date().toISOString();

    for (const r of (rows ?? []) as Array<{ id: string; talent_profile_id: string; changes: Record<string, unknown> }>) {
      // Filter changes through allowed fields again (defense in depth).
      const update: Record<string, unknown> = { updated_at: decidedAt };
      for (const [k, v] of Object.entries(r.changes)) {
        if (ALLOWED_FIELDS.has(k)) update[k] = v;
      }
      const { error: updateErr } = await admin
        .from("talent_profiles")
        .update(update)
        .eq("id", r.talent_profile_id);
      if (updateErr) {
        logServerError("profile-change-requests.accept.update", updateErr);
        failed += 1;
        continue;
      }
      await admin
        .from("talent_profile_change_requests")
        .update({ status: "accepted", decided_by_user_id: user.id, decided_at: decidedAt })
        .eq("id", r.id);
      accepted += 1;
    }

    revalidatePath("/", "layout");
    return { ok: true, data: { accepted, failed } };
  } catch (err) {
    logServerError("profile-change-requests.accept", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}

/**
 * Agency-staff reject: bulk reject (no profile mutation, just status
 * change + optional note). Multiple IDs supported for "Reject all".
 */
export async function rejectProfileChangeRequests(
  requestIds: string[],
  note?: string,
): Promise<ServerActionResult<{ rejected: number }>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    const { tenantId, user } = auth;

    if (requestIds.length === 0) {
      return { ok: false, error: "Pick at least one request.", reason: "validation_failed" };
    }

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    const { data: rows, error: updateErr } = await admin
      .from("talent_profile_change_requests")
      .update({
        status: "rejected",
        decided_by_user_id: user.id,
        decided_at: new Date().toISOString(),
        decision_note: note?.trim() || null,
      })
      .in("id", requestIds)
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .select("id");

    if (updateErr) {
      logServerError("profile-change-requests.reject", updateErr);
      return { ok: false, error: "Couldn't reject requests.", reason: "unexpected" };
    }

    revalidatePath("/", "layout");
    return { ok: true, data: { rejected: (rows ?? []).length } };
  } catch (err) {
    logServerError("profile-change-requests.reject", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}
