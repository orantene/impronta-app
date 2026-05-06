"use server";

/**
 * Roster bulk workflow actions.
 *
 * Capability: agency.roster.edit (same as individual edit).
 * Security boundary: only IDs confirmed to be on this tenant's roster are updated.
 */

import { revalidatePath } from "next/cache";
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
export async function bulkSetWorkflowStatus(
  tenantSlug: string,
  talentIds: string[],
  targetStatus: "published" | "hidden",
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

  const { error: updateErr, count } = await admin
    .from("talent_profiles")
    .update({ workflow_status: targetStatus, updated_at: new Date().toISOString() })
    .in("id", confirmedIds);

  if (updateErr) {
    logServerError("roster.bulkSetWorkflowStatus/update", updateErr);
    return { ok: false, error: "Could not update profiles. Try again." };
  }

  // Bulk audit event (best-effort — non-fatal)
  try {
    await admin.from("talent_workflow_events").insert(
      confirmedIds.map((talentId) => ({
        talent_profile_id: talentId,
        actor_user_id: session.user!.id,
        event_type: "workflow_status_changed",
        payload: { to: targetStatus, note: "bulk action" },
      })),
    );
  } catch (e) {
    logServerError("roster.bulkSetWorkflowStatus/auditEvents", e);
  }

  revalidatePath(`/${tenantSlug}/admin/roster`);
  return { ok: true, updatedCount: count ?? confirmedIds.length };
}
