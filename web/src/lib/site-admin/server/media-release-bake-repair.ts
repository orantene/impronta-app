import "server-only";

/**
 * media-release-bake-repair.ts — putting a release back together after its
 * watermark bake failed (media-ownership plan A4).
 *
 * WHY ITS OWN MODULE. `media-release-requests.ts` was already within a line or
 * two of the 800-line lint cap it was itself split out of, and this is a
 * distinct step in the rail rather than more of the decide path: approval
 * decides and bakes, `rollBackFailedReleaseBakes` undoes what could not bake,
 * and this pair re-does it once the cause is fixed. The only thing it borrows
 * from the decide path is `insertGrants`, imported rather than copied so there
 * is still exactly one writer of a `media_grants` row.
 *
 * `media-grants.ts` re-exports both functions, so callers keep importing from
 * there. This file must never import `media-grants.ts` — that would be a cycle.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  bustKeysFor,
  loadSubjectAssets,
  logGrantActivity,
  parseReleaseScopes,
  resolveAllHubsBustTenantIds,
  MAX_RELEASE_ASSETS,
  type MediaGrantBustKey,
  type MediaGrantResult,
} from "./media-grants-shared";
import {
  recordFailedReleaseBakes,
  resolveReleaseBakeFailures,
} from "./media-release-bake-failures";
import { insertGrants } from "./media-release-requests";

export type ReleaseBakeRepairPlan = {
  talentProfileId: string;
  /** The hub the approval pointed at; null = every hub. */
  targetTenantId: string | null;
  /** The asked-for ids narrowed to what this workspace may still act on. */
  assetIds: string[];
};

/**
 * What a "retry watermark" click is allowed to touch.
 *
 * The caller hands over asset ids that came back from ITS OWN approval call, so
 * they are client-supplied by the time they arrive here and are re-derived from
 * scratch rather than trusted:
 *
 *   • the request must be an APPROVED release addressed to this workspace,
 *   • the ids must appear in that request's `approved_scopes` — the rollback
 *     revoked the grants but deliberately left `approved_scopes` intact, so it
 *     is still the authoritative list of what was approved,
 *   • the assets must STILL be owned by this workspace and be of that talent.
 *
 * The target hub comes from the stored scopes too, never from the caller: a
 * repair must not be able to re-point a release at a different hub.
 */
export async function loadReleaseBakeRepairPlan(
  admin: SupabaseClient,
  input: { tenantId: string; requestId: string; assetIds: readonly string[] },
): Promise<MediaGrantResult<ReleaseBakeRepairPlan>> {
  if (input.assetIds.length === 0) return { ok: false, error: "Nothing to retry." };
  if (input.assetIds.length > MAX_RELEASE_ASSETS) {
    return { ok: false, error: `Retry at most ${MAX_RELEASE_ASSETS} photos at a time.` };
  }

  const { data, error } = await admin
    .from("talent_agency_permission_requests")
    .select("id, talent_profile_id, approved_scopes, status")
    .eq("id", input.requestId)
    .eq("requesting_tenant_id", input.tenantId)
    .eq("status", "approved")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "That release is no longer available to retry." };
  }

  const row = data as {
    talent_profile_id: string;
    approved_scopes: string[] | null;
  };
  const { assetIds: approvedIds, targetTenantId } = parseReleaseScopes(row.approved_scopes);
  const approved = new Set(approvedIds);
  const asked = [...new Set(input.assetIds)].filter((id) => approved.has(id));
  if (asked.length === 0) {
    return { ok: false, error: "Those photos are not part of that release." };
  }

  const assets = await loadSubjectAssets(admin, row.talent_profile_id, asked);
  const assetIds = assets
    .filter((a) => a.ownership_kind === "agency" && a.owner_tenant_id === input.tenantId)
    .map((a) => a.id);
  if (assetIds.length === 0) {
    return { ok: false, error: "Those photos are no longer this workspace's to release." };
  }

  return { ok: true, data: { talentProfileId: row.talent_profile_id, targetTenantId, assetIds } };
}

export type ReleaseBakeRepairOutcome = {
  /** Assets whose owner key is live again. */
  repaired: number;
  bustKeys: MediaGrantBustKey[];
};

/**
 * Settle one "Retry watermark" click: put the owner key back on what baked, and
 * leave what did not on the repair queue with its attempt count bumped.
 *
 * THE COUNTERPART TO `rollBackFailedReleaseBakes`, and deliberately the mirror
 * of it in both halves. The rollback revoked the owner grant AND opened the
 * queue row; this closes the queue row AND writes the grant back — with
 * `watermark_required: true`, because that is the whole reason the derivative
 * was baked and a repair must never quietly release the unmarked original.
 *
 * BOTH LISTS IN ONE CALL on purpose. Resolving the repaired rows without
 * re-stamping the failed ones would leave a queue that quietly forgets how many
 * times a photo has been tried; re-stamping without resolving would keep
 * offering to repair photos that are already live. One call, one settlement.
 *
 * `insertGrants` is idempotent (the live-grant unique index turns a re-insert
 * into a 23505 it ignores), so a double click costs a wasted round trip, not a
 * second grant.
 */
export async function settleReleaseBakeRetry(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    requestId: string;
    talentProfileId: string;
    targetTenantId: string | null;
    /** Assets whose bake succeeded this time. */
    assetIds: readonly string[];
    /** Assets that failed again and stay on the queue. */
    failedAssetIds?: readonly string[];
    actorUserId: string;
  },
): Promise<ReleaseBakeRepairOutcome> {
  // The queue is settled before the early return: a retry where EVERYTHING
  // failed again still has to record the attempt, or the count staff read to
  // decide "this one needs a human" never moves.
  if (input.failedAssetIds && input.failedAssetIds.length > 0) {
    await recordFailedReleaseBakes(admin, {
      tenantId: input.tenantId,
      requestId: input.requestId,
      talentProfileId: input.talentProfileId,
      targetTenantId: input.targetTenantId,
      assetIds: input.failedAssetIds,
    });
  }

  if (input.assetIds.length === 0) return { repaired: 0, bustKeys: [] };

  await insertGrants(admin, {
    assetIds: input.assetIds,
    grantKind: "owner",
    targetTenantId: input.targetTenantId,
    grantedBy: input.actorUserId,
    sourceRequestId: input.requestId,
    watermarkRequired: true,
  });

  await resolveReleaseBakeFailures(admin, {
    requestId: input.requestId,
    assetIds: input.assetIds,
    resolution: "repaired",
  });

  await logGrantActivity(admin, input.tenantId, input.assetIds, "grant.release_bake_repaired", {
    request_id: input.requestId,
    talent_profile_id: input.talentProfileId,
    target_tenant_id: input.targetTenantId,
    actor_user_id: input.actorUserId,
    repaired_grants: input.assetIds.length,
  });

  const extraHubIds =
    input.targetTenantId === null
      ? await resolveAllHubsBustTenantIds(admin, {
          talentProfileId: input.talentProfileId,
          assetIds: input.assetIds,
        })
      : [];

  return {
    repaired: input.assetIds.length,
    bustKeys: bustKeysFor(input.talentProfileId, input.tenantId, input.targetTenantId, extraHubIds),
  };
}
