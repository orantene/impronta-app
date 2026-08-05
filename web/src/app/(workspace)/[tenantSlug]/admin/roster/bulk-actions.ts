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
import { notifyTalentProfileApproved } from "@/lib/notifications/producers/talent-profile-approved-notify";
import { assertTalentReadyForPublicListing } from "@/lib/field-engine/profile-publish-server-gate";

export type BulkWorkflowResult =
  | { ok: true; updatedCount: number; skippedCount?: number; skippedNames?: string[] }
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
  // Also read the current agency_visibility so we can tell which talents are
  // *newly* becoming site-visible (→ talent.profile_approved notification).
  const { data: rosterRows, error: rosterErr } = await admin
    .from("agency_talent_roster")
    .select("talent_profile_id, agency_visibility")
    .eq("tenant_id", scope.tenantId)
    .in("talent_profile_id", talentIds)
    .neq("status", "removed");

  if (rosterErr) {
    logServerError("roster.bulkSetWorkflowStatus/rosterCheck", rosterErr);
    return { ok: false, error: "Could not verify roster membership." };
  }

  const allConfirmedRows = (rosterRows ?? []) as Array<{
    talent_profile_id: string;
    agency_visibility: string | null;
  }>;

  if (allConfirmedRows.length === 0) return { ok: true, updatedCount: 0 };

  // Publish checklist — the eye is the public gate now, so bulk publish has to
  // clear the same bar as the single-row toggle or it becomes the way around it.
  // Checked per row and non-fatal: one incomplete profile shouldn't sink the
  // whole batch, so unready rows are skipped and reported back to the caller.
  let confirmedRows = allConfirmedRows;
  let skippedNames: string[] = [];
  if (targetStatus === "publish") {
    const verdicts = await Promise.all(
      allConfirmedRows.map(async (row) => ({
        row,
        ready: await assertTalentReadyForPublicListing({
          supabase: admin,
          tenantId: scope.tenantId,
          talentProfileId: row.talent_profile_id,
        }),
      })),
    );
    confirmedRows = verdicts.filter((v) => v.ready.ok).map((v) => v.row);
    const blockedIds = verdicts.filter((v) => !v.ready.ok).map((v) => v.row.talent_profile_id);
    if (blockedIds.length > 0) {
      const { data: blockedProfiles } = await admin
        .from("talent_profiles")
        .select("id, display_name")
        .in("id", blockedIds);
      const byId = new Map(
        ((blockedProfiles ?? []) as Array<{ id: string; display_name: string | null }>).map(
          (p) => [p.id, p.display_name],
        ),
      );
      skippedNames = blockedIds.map((id) => byId.get(id) || "Unnamed profile");
    }
    if (confirmedRows.length === 0) {
      return { ok: true, updatedCount: 0, skippedCount: skippedNames.length, skippedNames };
    }
  }

  const confirmedIds = confirmedRows.map((r) => r.talent_profile_id);

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

  // talent.profile_approved (spec §6.3) — notify each talent who *transitioned*
  // into site-visible. Skip those already site_visible/featured so a re-publish
  // doesn't re-email. Fire-and-forget per talent; the helper resolves each
  // talent's account + canonical profile URL and dedupes per tenant+talent.
  if (targetStatus === "publish") {
    const alreadyVisible = new Set(["site_visible", "featured"]);
    for (const row of confirmedRows) {
      if (alreadyVisible.has(row.agency_visibility ?? "")) continue;
      void notifyTalentProfileApproved({
        admin,
        tenantId: scope.tenantId,
        talentProfileId: row.talent_profile_id,
      });
    }
  }

  revalidatePath(`/${tenantSlug}/admin/roster`);
  revalidateDirectoryListing();
  return {
    ok: true,
    updatedCount: count ?? confirmedIds.length,
    ...(skippedNames.length > 0
      ? { skippedCount: skippedNames.length, skippedNames }
      : {}),
  };
}
