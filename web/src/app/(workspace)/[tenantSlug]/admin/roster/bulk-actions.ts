"use server";

/**
 * Roster bulk workflow actions.
 *
 * Capability: agency.roster.edit (same as individual edit).
 * Security boundary: only IDs confirmed to be on this tenant's roster are updated.
 */

import { revalidatePath } from "next/cache";
import { revalidateDirectoryListing } from "@/lib/revalidate-public";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

export type BulkWorkflowResult =
  | { ok: true; updatedCount: number }
  | { ok: false; error: string };

/**
 * Bulk-update workflow_status for a list of talent IDs on this tenant's roster.
 * Only IDs that are confirmed to be on this tenant's roster (status != 'removed') are touched.
 * Returns the number of profiles actually updated.
 */
/**
 * Public visibility is governed by the agency directory eye
 * (`agency_talent_roster.agency_visibility`):
 *   "publish" → agency_visibility='site_visible' (shown in directory + search)
 *   "archive" → agency_visibility='roster_only'  (on the roster, not public)
 *
 * The legacy `talent_profiles.workflow_status` / `visibility` columns are kept
 * coherent for audit/claim flows but no longer gate public display.
 */
export async function bulkSetWorkflowStatus(
  tenantSlug: string,
  talentIds: string[],
  targetStatus: "publish" | "archive",
): Promise<BulkWorkflowResult> {
  if (talentIds.length === 0) return { ok: true, updatedCount: 0 };

  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };

  const canEdit = await userHasCapability("agency.roster.edit", scope.tenantId);
  if (!canEdit) return { ok: false, error: "You don't have permission to edit talent." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  // Resolve which IDs are actually on this tenant's roster (security boundary).
  const { data: rosterRows, error: rosterErr } = await admin
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", scope.tenantId)
    .in("talent_profile_id", talentIds)
    .neq("status", "removed");

  if (rosterErr) {
    logServerError("roster.bulkSetWorkflowStatus/rosterCheck", rosterErr);
    return { ok: false, error: "Could not verify roster membership." };
  }

  const confirmedIds = (rosterRows ?? []).map(
    (r) => (r as { talent_profile_id: string }).talent_profile_id,
  );

  if (confirmedIds.length === 0) return { ok: true, updatedCount: 0 };

  // Public gate — flip the agency directory eye on the roster rows.
  const { error: rosterUpdErr } = await admin
    .from("agency_talent_roster")
    .update({
      agency_visibility: targetStatus === "publish" ? "site_visible" : "roster_only",
    })
    .eq("tenant_id", scope.tenantId)
    .in("talent_profile_id", confirmedIds)
    .neq("status", "removed");

  if (rosterUpdErr) {
    logServerError("roster.bulkSetWorkflowStatus/rosterUpdate", rosterUpdErr);
    return { ok: false, error: "Could not update visibility. Try again." };
  }

  // Keep the legacy lifecycle column coherent (audit / claim flows still
  // read it) — best-effort, non-fatal if it fails.
  const updatePayload =
    targetStatus === "publish"
      ? { workflow_status: "approved", visibility: "public", updated_at: new Date().toISOString() }
      : { workflow_status: "hidden", updated_at: new Date().toISOString() };

  const { error: updateErr, count } = await admin
    .from("talent_profiles")
    .update(updatePayload)
    .in("id", confirmedIds);

  if (updateErr) {
    logServerError("roster.bulkSetWorkflowStatus/update", updateErr);
  }

  // Bulk audit event (best-effort — non-fatal)
  try {
    await admin.from("talent_workflow_events").insert(
      confirmedIds.map((talentId) => ({
        tenant_id: scope.tenantId,
        talent_profile_id: talentId,
        actor_user_id: session.user!.id,
        event_type: "agency_visibility_changed",
        payload: {
          to: targetStatus === "publish" ? "site_visible" : "roster_only",
          note: "bulk roster visibility",
        },
      })),
    );
  } catch (e) {
    logServerError("roster.bulkSetWorkflowStatus/auditEvents", e);
  }

  revalidatePath(`/${tenantSlug}/admin/roster`);
  revalidateDirectoryListing();
  return { ok: true, updatedCount: count ?? confirmedIds.length };
}
