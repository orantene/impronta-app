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
 * REVOCATION IS A PRESENTATION CONTROL, NOT AN ACCESS CONTROL (D-4a).
 * Clearing the owner key makes the single resolver stop SELECTING the photo,
 * so it comes off cards and galleries on the next resolve. It does not take
 * the bytes away: every live media object sits in a `public = true` bucket at
 * a stable URL, so anyone who already saved, copied or embedded that URL can
 * still fetch it. Real takedown needs a private bucket plus a per-request
 * proxy (plan P0-1 option b) and is not built. Never tell a customer this
 * "un-publishes everywhere".
 *
 * What it DOES need to get right is the cache: every write below busts
 * `tenant:{tenantId}:talent-media:{talentId}` plus the storefront tag for the
 * owner AND every affected hub. Forget a tag and a revoked photo stays on
 * screen until the cache expires on its own.
 */

import { revalidatePath, revalidateTag } from "next/cache";

import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { checkWatermarkOnReleaseEntitlement } from "@/lib/billing/media-entitlements";
import { hubTalentMediaTag } from "@/lib/media/talent-media-for-hub";
import {
  bakeWatermarkedVariant,
  loadWatermarkBakeReadiness,
} from "@/lib/media/watermark-bake";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { tagFor } from "@/lib/site-admin/cache-tags";
import {
  decideMediaReleaseRequest,
  listMediaReleaseHistory,
  listMediaReleaseRequests,
  listPendingReleaseBakeRepairs,
  loadReleaseBakeRepairPlan,
  revokeMediaRelease,
  rollBackFailedReleaseBakes,
  settleReleaseBakeRetry,
  MAX_RELEASE_ASSETS,
  type MediaGrantBustKey,
  type MediaReleaseHistoryEntry,
  type MediaReleaseRequestSummary,
  type PendingReleaseBakeRepair,
  type ReleaseDecisionOutcome,
  type ReleaseRevokeOutcome,
} from "@/lib/site-admin/server/media-grants";
import { loadWorkspaceDisplayName } from "@/lib/site-admin/server/media-ownership";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type {
  MediaReleaseHistoryEntry,
  MediaReleaseRequestSummary,
  PendingReleaseBakeRepair,
} from "@/lib/site-admin/server/media-grants";

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

/**
 * What this workspace already decided (B15) — declined, withdrawn by the
 * talent, or a release it later ended. Read-only: there is no un-decline, and
 * re-approving means the talent asks again.
 *
 * A separate call from the open queue on purpose. It is collapsed by default,
 * so the panel can render its actionable half without waiting on history, and
 * a history read that fails never takes the decide buttons down with it.
 */
export async function actionListMediaReleaseHistory(): Promise<
  ActionResult<MediaReleaseHistoryEntry[]>
> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  return listMediaReleaseHistory(admin, auth.tenantId);
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

  const wantsWatermark = input.approve && input.watermarkRequired === true;

  // Pre-flight BEFORE the decision is recorded. A half-approved release that
  // then fails in the image pipeline would leave the photo travelling
  // unmarked — the opposite of what the staff member just asked for. Both
  // refusals below are fixable in one place each, so they say where.
  if (wantsWatermark) {
    const readiness = await loadWatermarkBakeReadiness(admin, auth.tenantId);
    const entitled = checkWatermarkOnReleaseEntitlement(readiness.planTier);
    if (!entitled.allowed) return { ok: false, error: entitled.message };
    if (!readiness.logoUrl) {
      return {
        ok: false,
        error:
          "Add your workspace logo under Settings, Branding before releasing photos with a watermark.",
      };
    }
  }

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

  // Bake at APPROVAL time, not at request time. The resolver refuses to serve
  // a watermark-required asset that has no derivative, so baking lazily would
  // mean the release silently shows nothing until someone visited the right
  // page. Sequential on purpose: sharp is memory-hungry and the cap is
  // MAX_RELEASE_ASSETS.
  //
  // A4 — the results are COLLECTED, not discarded. A bake can fail on download,
  // logo fetch, sharp or upload; the grant already exists and says the photo
  // may only travel marked, so a failure used to leave an approved, notified,
  // permanently invisible release with nothing retrying it.
  const failedAssetIds: string[] = [];
  if (wantsWatermark && result.data.grantedAssetIds.length > 0) {
    for (const assetId of result.data.grantedAssetIds) {
      const baked = await bakeWatermarkedVariant(admin, {
        assetId,
        tenantId: auth.tenantId,
        actorUserId: auth.user.id,
        // Ticking "require watermark" IS the enable — refusing here because a
        // workspace-level preset says `enabled: false` would approve an
        // unwatermarked release.
        requirePresetEnabled: false,
      });
      if (!baked.ok) failedAssetIds.push(assetId);
    }
  }

  // Roll the un-bakeable photos back out of the approval so the stored state
  // matches what is actually servable. The ones that baked stay released.
  let rolledBack = 0;
  if (failedAssetIds.length > 0) {
    rolledBack = await rollBackFailedReleaseBakes(admin, {
      tenantId: auth.tenantId,
      // The queue key. The same call that rolls these photos out of the release
      // records them as pending repairs, so the retry survives this response.
      requestId: input.requestId,
      assetIds: failedAssetIds,
      targetTenantId: result.data.targetTenantId,
      talentProfileId: result.data.talentProfileId,
      actorUserId: auth.user.id,
    });
  }

  const grantedNow = Math.max(0, result.data.granted - failedAssetIds.length);

  scheduleWorkspaceAudit({
    tenantId: auth.tenantId,
    category: "media",
    action: input.approve ? "media.release_approved" : "media.release_denied",
    summary: input.approve
      ? `Released ${grantedNow} photo${grantedNow === 1 ? "" : "s"} for use elsewhere`
      : "Declined a photo release request",
    targetType: "media_release_request",
    targetId: input.requestId,
    metadata: {
      granted: grantedNow,
      notified: result.data.notified,
      watermark_required: wantsWatermark,
      watermark_failed: failedAssetIds.length,
      rolled_back_grants: rolledBack,
    },
  });

  bust(result.data.bustKeys, auth.tenantSlug);

  if (failedAssetIds.length === 0) return result;

  // Partial success. Naming the count and the reason beats a green tick over a
  // release that shows nothing. The retry itself no longer hangs off this
  // response — the photos are on the workspace's watermark-repairs list until
  // they bake or the release is revoked — so the copy points at the list.
  return {
    ok: true,
    data: {
      ...result.data,
      granted: grantedNow,
      warning: `${failedAssetIds.length} photo${failedAssetIds.length === 1 ? "" : "s"} could not be watermarked and ${failedAssetIds.length === 1 ? "was" : "were"} left unreleased. Check the workspace logo under Settings, Branding, then retry from Watermark repairs. The list keeps them after a reload.`,
      failedAssetIds,
    },
  };
}

/**
 * The workspace's outstanding watermark repairs — the durable half of A4.
 *
 * Read from `media_release_bake_failures`, whose only writer is the bake-failure
 * rollback. A staff revoke RESOLVES rows here rather than creating them, so a
 * photo somebody deliberately pulled can never show up as a repair candidate.
 */
export async function actionListReleaseBakeRepairs(): Promise<
  ActionResult<PendingReleaseBakeRepair[]>
> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  return listPendingReleaseBakeRepairs(admin, auth.tenantId);
}

export type ReleaseBakeRetryOutcome = {
  /** Photos whose watermark baked this time and are released again. */
  repaired: number;
  /** Photos that failed again and are still not released. */
  stillFailing: number;
};

/**
 * A4 — retry the watermark bake for photos an approval could not bake.
 *
 * WHY THIS EXISTS AS ITS OWN ACTION. The approval path bakes, and on failure
 * rolls the un-bakeable photos back out of the release so the stored state
 * matches what is servable. That left no way forward inside the product:
 * `decideMediaReleaseRequest` only answers a PENDING request, and the request
 * is `approved` by then, so the "approve again" the old warning suggested was
 * not a thing anyone could do. If every photo failed, the card also drops out
 * of the queue entirely (an approved row is only listed while an owner grant is
 * live), so even the manual route was gone.
 *
 * WHERE THE FAILED IDS COME FROM (migration 20261119000000). They are STORED,
 * in `media_release_bake_failures`, one pending row per (request, asset),
 * written by `rollBackFailedReleaseBakes` — the one code path that knows a
 * missing owner key means "the bake failed" and not "staff pulled it". Before
 * that table the only copy was the approval response, so the retry died on
 * reload; the `grant.release_bake_failed` activity row it also writes is an
 * append-only audit trail with no resolved state, which a queue cannot be read
 * from.
 *
 * It is still deliberately NOT re-derived from "an approved asset with no live
 * grant": that also matches every photo a staff member intentionally revoked,
 * and re-releasing those would undo a takedown. Revocation instead RESOLVES the
 * matching rows, so intent flows one way only.
 *
 * Ids are re-validated server-side against the stored `approved_scopes` and
 * current ownership — see `loadReleaseBakeRepairPlan`. The queue is a
 * convenience for the caller, never the authority on what may be re-released.
 */
export async function actionRetryReleaseWatermarkBake(input: {
  requestId: string;
  assetIds: string[];
}): Promise<ActionResult<ReleaseBakeRetryOutcome>> {
  if (!UUID_RE.test(input.requestId)) return { ok: false, error: "Invalid request." };
  if (!Array.isArray(input.assetIds) || input.assetIds.length === 0) {
    return { ok: false, error: "Nothing to retry." };
  }
  if (input.assetIds.length > MAX_RELEASE_ASSETS) {
    return { ok: false, error: `Retry at most ${MAX_RELEASE_ASSETS} photos at a time.` };
  }
  if (input.assetIds.some((id) => !UUID_RE.test(id))) return { ok: false, error: "Invalid request." };

  const auth = await requireWorkspaceStaffAction({ capability: "agency.roster.edit" });
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const plan = await loadReleaseBakeRepairPlan(admin, {
    tenantId: auth.tenantId,
    requestId: input.requestId,
    assetIds: input.assetIds,
  });
  if (!plan.ok) return plan;

  // Same pre-flight as the approval. A missing logo is the most common cause of
  // the failure being retried, and saying so beats N identical bake failures.
  const readiness = await loadWatermarkBakeReadiness(admin, auth.tenantId);
  const entitled = checkWatermarkOnReleaseEntitlement(readiness.planTier);
  if (!entitled.allowed) return { ok: false, error: entitled.message };
  if (!readiness.logoUrl) {
    return {
      ok: false,
      error:
        "Add your workspace logo under Settings, Branding before retrying the watermark.",
    };
  }

  const baked: string[] = [];
  const stillFailingIds: string[] = [];
  for (const assetId of plan.data.assetIds) {
    const result = await bakeWatermarkedVariant(admin, {
      assetId,
      tenantId: auth.tenantId,
      actorUserId: auth.user.id,
      // The release already decided the photo may only travel marked, so a
      // workspace preset that says `enabled: false` must not veto the repair —
      // same reasoning as the approval path, and the same reason the repair
      // route passes `repair: true`.
      requirePresetEnabled: false,
    });
    if (result.ok) baked.push(assetId);
    else stillFailingIds.push(assetId);
  }
  const stillFailing = stillFailingIds.length;

  // One settlement for both halves: the repaired rows leave the queue, the ones
  // that failed again stay on it with their attempt count bumped.
  const outcome = await settleReleaseBakeRetry(admin, {
    tenantId: auth.tenantId,
    requestId: input.requestId,
    talentProfileId: plan.data.talentProfileId,
    targetTenantId: plan.data.targetTenantId,
    assetIds: baked,
    failedAssetIds: stillFailingIds,
    actorUserId: auth.user.id,
  });

  scheduleWorkspaceAudit({
    tenantId: auth.tenantId,
    category: "media",
    action: "media.release_bake_retried",
    summary: `Retried the watermark for ${plan.data.assetIds.length} photo${plan.data.assetIds.length === 1 ? "" : "s"}`,
    targetType: "media_release_request",
    targetId: input.requestId,
    metadata: {
      attempted: plan.data.assetIds.length,
      repaired: outcome.repaired,
      still_failing: stillFailing,
    },
  });

  if (outcome.repaired > 0) bust(outcome.bustKeys, auth.tenantSlug);

  return { ok: true, data: { repaired: outcome.repaired, stillFailing } };
}

/**
 * End a live release.
 *
 * SCOPE (A6 / D-6). `targetTenantId` names the hub whose release is ending, so
 * ending a release to hub B leaves the live releases to C and D alone. Omit it
 * (or pass null) to end an `all_hubs` release, where everywhere IS the target.
 *
 * The photos stop being SHOWN on the affected sites at the next resolve. They
 * do not become unreachable — see this module's header.
 */
export async function actionRevokeMediaRelease(input: {
  talentProfileId: string;
  assetIds: string[];
  /** The hub to end the release to. Null/omitted = end it everywhere. */
  targetTenantId?: string | null;
}): Promise<ActionResult<ReleaseRevokeOutcome>> {
  if (!UUID_RE.test(input.talentProfileId)) return { ok: false, error: "Invalid request." };
  if (
    input.targetTenantId !== undefined &&
    input.targetTenantId !== null &&
    !UUID_RE.test(input.targetTenantId)
  ) {
    return { ok: false, error: "Invalid request." };
  }
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
    targetTenantId: input.targetTenantId ?? null,
  });
  if (!result.ok) return result;

  scheduleWorkspaceAudit({
    tenantId: auth.tenantId,
    category: "media",
    action: "media.release_revoked",
    summary: `Ended a photo release for ${result.data.revoked} photo${result.data.revoked === 1 ? "" : "s"}`,
    targetType: "talent_profile",
    targetId: input.talentProfileId,
    metadata: {
      revoked: result.data.revoked,
      notified: result.data.notified,
      target_tenant_id: result.data.revokedTargetTenantId,
    },
  });

  bust(result.data.bustKeys, auth.tenantSlug);
  return result;
}
