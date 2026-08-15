"use server";

/**
 * admin-media-release.ts — the workspace side of the two-key rule.
 *
 * Staff see release requests from talents they represent, approve or decline
 * them, and can revoke a live release later. Approval writes the OWNER key;
 * the SUBJECT key was written when the talent asked.
 *
 * Auth + audit + cache-bust wrapper only. Queries live in
 * `@/lib/site-admin/server/media-grants` so this file holds no raw `.from()`.
 *
 * The tenant is ALWAYS the caller's own workspace, never client-supplied — a
 * workspace can only release photos it owns.
 *
 * REVOCATION IS THE RISKY PATH (plan §8): it has to un-publish everywhere.
 * That works because there is exactly one resolver, and because every write
 * below busts `tenant:{tenantId}:talent-media:{talentId}` plus the storefront
 * tag for BOTH the owner and the target hub. Forget a tag and a revoked photo
 * stays up until the cache expires.
 */

import { revalidatePath, revalidateTag } from "next/cache";

import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { hubTalentMediaTag } from "@/lib/media/talent-media-for-hub";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { tagFor } from "@/lib/site-admin/cache-tags";
import {
  decideMediaReleaseRequest,
  listMediaReleaseRequests,
  revokeMediaRelease,
  MAX_RELEASE_ASSETS,
  type MediaGrantBustKey,
  type MediaReleaseRequestSummary,
  type ReleaseDecisionOutcome,
  type ReleaseRevokeOutcome,
} from "@/lib/site-admin/server/media-grants";
import { loadWorkspaceDisplayName } from "@/lib/site-admin/server/media-ownership";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type { MediaReleaseRequestSummary } from "@/lib/site-admin/server/media-grants";

function bust(keys: readonly MediaGrantBustKey[], tenantSlug: string): void {
  for (const key of keys) {
    revalidateTag(hubTalentMediaTag(key.tenantId, key.talentProfileId), "default");
    revalidateTag(tagFor(key.tenantId, "storefront"), "default");
  }
  revalidatePath(`/${tenantSlug}`, "layout");
}

/** Open release requests addressed to this workspace. */
export async function actionListMediaReleaseRequests(): Promise<
  ActionResult<MediaReleaseRequestSummary[]>
> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  return listMediaReleaseRequests(admin, auth.tenantId);
}

/** Approve or decline one release request. */
export async function actionDecideMediaReleaseRequest(input: {
  requestId: string;
  approve: boolean;
  watermarkRequired?: boolean;
}): Promise<ActionResult<ReleaseDecisionOutcome>> {
  if (!UUID_RE.test(input.requestId)) return { ok: false, error: "Invalid request." };

  const auth = await requireWorkspaceStaffAction({ capability: "agency.roster.edit" });
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const workspaceName = await loadWorkspaceDisplayName(admin, auth.tenantId);
  const result = await decideMediaReleaseRequest(admin, {
    tenantId: auth.tenantId,
    workspaceName,
    requestId: input.requestId,
    approve: input.approve,
    watermarkRequired: input.watermarkRequired,
    actorUserId: auth.user.id,
  });
  if (!result.ok) return result;

  scheduleWorkspaceAudit({
    tenantId: auth.tenantId,
    category: "media",
    action: input.approve ? "media.release_approved" : "media.release_denied",
    summary: input.approve
      ? `Released ${result.data.granted} photo${result.data.granted === 1 ? "" : "s"} for use elsewhere`
      : "Declined a photo release request",
    targetType: "media_release_request",
    targetId: input.requestId,
    metadata: { granted: result.data.granted, notified: result.data.notified },
  });

  bust(result.data.bustKeys, auth.tenantSlug);
  return result;
}

/**
 * End a live release. The photos come down everywhere outside this workspace
 * on the next resolve.
 */
export async function actionRevokeMediaRelease(input: {
  talentProfileId: string;
  assetIds: string[];
}): Promise<ActionResult<ReleaseRevokeOutcome>> {
  if (!UUID_RE.test(input.talentProfileId)) return { ok: false, error: "Invalid request." };
  if (!Array.isArray(input.assetIds) || input.assetIds.length === 0) {
    return { ok: false, error: "Select at least one photo." };
  }
  if (input.assetIds.length > MAX_RELEASE_ASSETS) {
    return { ok: false, error: `Revoke at most ${MAX_RELEASE_ASSETS} photos at a time.` };
  }
  if (input.assetIds.some((id) => !UUID_RE.test(id))) return { ok: false, error: "Invalid request." };

  const auth = await requireWorkspaceStaffAction({ capability: "agency.roster.edit" });
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const workspaceName = await loadWorkspaceDisplayName(admin, auth.tenantId);
  const result = await revokeMediaRelease(admin, {
    tenantId: auth.tenantId,
    workspaceName,
    talentProfileId: input.talentProfileId,
    assetIds: input.assetIds,
    actorUserId: auth.user.id,
  });
  if (!result.ok) return result;

  scheduleWorkspaceAudit({
    tenantId: auth.tenantId,
    category: "media",
    action: "media.release_revoked",
    summary: `Ended a photo release for ${result.data.revoked} photo${result.data.revoked === 1 ? "" : "s"}`,
    targetType: "talent_profile",
    targetId: input.talentProfileId,
    metadata: { revoked: result.data.revoked, notified: result.data.notified },
  });

  bust(result.data.bustKeys, auth.tenantSlug);
  return result;
}
