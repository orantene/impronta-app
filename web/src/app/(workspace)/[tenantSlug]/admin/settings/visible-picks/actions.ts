"use server";

/**
 * TUL-1591 (e): the owner keeps a member visible over the plan cap (or drops the pick).
 * The pick is the roster's own `keep_visible` (TUL-1693), never `agency_visibility =
 * 'featured'` (that is also a theme badge and drives featured listings). Roster editors only, never while impersonating, only for an ACTIVE member
 * who is already public, and only while HUB_PLAN_CAP_PICKS_ENABLED=1. While the
 * keep_visible migration is not applied it writes nothing and returns "not_ready".
 */
import { revalidatePath } from "next/cache";

import { logWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { revalidateDirectoryListing } from "@/lib/revalidate-public";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import { nextKeepVisible, visiblePicksEnabled } from "@/lib/service-hub/visible-picks";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

export type SetVisiblePickResult = { ok: true } | { ok: false; reason: "unavailable" | "not_ready" | "not_allowed" | "not_found" | "not_public" | "failed" };

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
      .select("id, agency_visibility, keep_visible")
      .eq("talent_profile_id", parsed.data)
      .eq("status", "active")
      .maybeSingle();
    if (readErr) {
      if (isPostgrestMissingColumnError(readErr)) return { ok: false, reason: "not_ready" };
      logServerError("serviceHub.visiblePicks.read", readErr);
      return { ok: false, reason: "failed" };
    }
    if (!row) return { ok: false, reason: "not_found" };
    const r = row as { id: string; agency_visibility: string | null; keep_visible: boolean | null };
    const current = r.keep_visible === true;
    const decision = nextKeepVisible({ agencyVisibility: r.agency_visibility, keepVisible: current }, input.keep);
    if (!decision.ok) return { ok: false, reason: decision.reason };
    if (decision.next === null) return { ok: true };

    // Pinned to the row's current value so a concurrent edit is not overwritten blind.
    const { error } = await tenantScopedQuery(admin, "agency_talent_roster", tenantId)
      .update({ keep_visible: decision.next })
      .eq("id", r.id)
      .eq("status", "active")
      .eq("keep_visible", current);
    if (error) {
      if (isPostgrestMissingColumnError(error)) return { ok: false, reason: "not_ready" };
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
      metadata: { field: "keep_visible", from: current, to: decision.next },
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
