"use server";

/**
 * TUL-1591 (e): the owner keeps a member visible over the plan cap (or drops the pick).
 * The pick is the roster's `agency_visibility = 'featured'` (#4178 reads it in the public
 * directory). Roster editors only, never while impersonating, only for an ACTIVE member
 * who is already public, and only while HUB_PLAN_CAP_PICKS_ENABLED=1.
 */
import { revalidatePath } from "next/cache";

import { logWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { revalidateDirectoryListing } from "@/lib/revalidate-public";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { nextPickVisibility, visiblePicksEnabled } from "@/lib/service-hub/visible-picks";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

export type SetVisiblePickResult = { ok: true } | { ok: false; reason: "unavailable" | "not_allowed" | "not_found" | "not_public" | "failed" };

export async function setVisiblePick(input: { talentProfileId: string; keep: boolean }): Promise<SetVisiblePickResult> {
  await requireNotImpersonating();
  if (!visiblePicksEnabled()) return { ok: false, reason: "unavailable" };
  const parsed = pgUuidSchema().safeParse(input.talentProfileId);
  if (!parsed.success || typeof input.keep !== "boolean") return { ok: false, reason: "not_found" };
  try {
    const guard = await requireWorkspaceStaffAction({ capability: "agency.roster.edit" });
    if (!guard.ok) return { ok: false, reason: "not_allowed" };
    const { tenantId, tenantSlug, user } = guard;
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };

    const { data: row, error: readErr } = await tenantScopedQuery(admin, "agency_talent_roster", tenantId)
      .select("id, agency_visibility")
      .eq("talent_profile_id", parsed.data)
      .eq("status", "active")
      .maybeSingle();
    if (readErr) {
      logServerError("serviceHub.visiblePicks.read", readErr);
      return { ok: false, reason: "failed" };
    }
    if (!row) return { ok: false, reason: "not_found" };
    const current = (row as { agency_visibility: string | null }).agency_visibility;
    const decision = nextPickVisibility(current, input.keep);
    if (!decision.ok) return { ok: false, reason: decision.reason };
    if (decision.next === null) return { ok: true };

    // Pinned to the row's current value so a concurrent edit is not overwritten blind.
    const { error } = await tenantScopedQuery(admin, "agency_talent_roster", tenantId)
      .update({ agency_visibility: decision.next })
      .eq("id", (row as { id: string }).id)
      .eq("status", "active")
      .eq("agency_visibility", current);
    if (error) {
      logServerError("serviceHub.visiblePicks.update", error);
      return { ok: false, reason: "failed" };
    }
    await logWorkspaceAudit({
      tenantId,
      category: "roster",
      action: "roster.talent.visible_pick",
      summary: input.keep ? "Kept a person visible over the plan cap" : "Removed a visible pick",
      targetType: "talent_profile",
      targetId: parsed.data,
      actorUserId: user.id,
      metadata: { from: current, to: decision.next },
    });
    revalidatePath(`/${tenantSlug}/admin/settings/visible-picks`);
    revalidatePath(`/${tenantSlug}/admin/roster`);
    revalidateDirectoryListing();
    return { ok: true };
  } catch (err) {
    logServerError("serviceHub.visiblePicks.set", err);
    return { ok: false, reason: "failed" };
  }
}
