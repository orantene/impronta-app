"use server";

/**
 * ownership-actions.ts — auth + audit wrappers for the media ownership tool.
 *
 * Every query lives in `@/lib/site-admin/server/media-ownership`; this file
 * only proves who is calling, hands the service-role client over, and records
 * the workspace audit event. Same split as admin-branding-media.ts (phase 0).
 *
 * Product contract (plan §5b): legacy media stays talent-owned by default. A
 * workspace can say "we produced these", the talent is told, and the workspace
 * can hand them back. Nothing about WHERE a photo appears changes here —
 * that is phase 2/3. Ownership is recorded truth, not yet an access gate.
 */

import { revalidatePath } from "next/cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  claimMediaAsWorkspaceOwned,
  releaseMediaToTalent,
  loadWorkspaceDisplayName,
  MEDIA_CLAIM_OBJECTION_DAYS,
  type MediaClaimOutcome,
  type MediaReleaseOutcome,
} from "@/lib/site-admin/server/media-ownership";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Cap per call so one click can't fan out into an unbounded write. */
const MAX_IDS_PER_CALL = 500;

export async function actionClaimMediaOwnership(
  assetIds: string[],
): Promise<ActionResult<MediaClaimOutcome>> {
  const auth = await requireWorkspaceStaffAction({ capability: "agency.roster.edit" });
  if (!auth.ok) return { ok: false, error: auth.error };
  if (assetIds.length > MAX_IDS_PER_CALL) {
    return { ok: false, error: `Select at most ${MAX_IDS_PER_CALL} photos at a time.` };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const workspaceName = await loadWorkspaceDisplayName(admin, auth.tenantId);
  const result = await claimMediaAsWorkspaceOwned(admin, {
    tenantId: auth.tenantId,
    workspaceName,
    actorUserId: auth.user.id,
    assetIds,
  });
  if (!result.ok) return result;

  if (result.data.claimed > 0) {
    scheduleWorkspaceAudit({
      tenantId: auth.tenantId,
      category: "media",
      action: "media.ownership_claimed",
      summary: `Marked ${result.data.claimed} photo${result.data.claimed === 1 ? "" : "s"} as workspace-owned`,
      targetType: "media_asset",
      targetId: assetIds[0],
      metadata: {
        count: result.data.claimed,
        skipped: result.data.skipped,
        notified: result.data.notified,
        objectionDays: MEDIA_CLAIM_OBJECTION_DAYS,
      },
    });
    revalidatePath(`/${auth.tenantSlug}`, "layout");
  }

  return result;
}

export async function actionReleaseMediaOwnership(
  assetIds: string[],
): Promise<ActionResult<MediaReleaseOutcome>> {
  const auth = await requireWorkspaceStaffAction({ capability: "agency.roster.edit" });
  if (!auth.ok) return { ok: false, error: auth.error };
  if (assetIds.length > MAX_IDS_PER_CALL) {
    return { ok: false, error: `Select at most ${MAX_IDS_PER_CALL} photos at a time.` };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const workspaceName = await loadWorkspaceDisplayName(admin, auth.tenantId);
  const result = await releaseMediaToTalent(admin, {
    tenantId: auth.tenantId,
    workspaceName,
    actorUserId: auth.user.id,
    assetIds,
  });
  if (!result.ok) return result;

  if (result.data.released > 0) {
    scheduleWorkspaceAudit({
      tenantId: auth.tenantId,
      category: "media",
      action: "media.ownership_released",
      summary: `Gave ${result.data.released} photo${result.data.released === 1 ? "" : "s"} back to the talent`,
      targetType: "media_asset",
      targetId: assetIds[0],
      metadata: { count: result.data.released, skipped: result.data.skipped },
    });
    revalidatePath(`/${auth.tenantSlug}`, "layout");
  }

  return result;
}
