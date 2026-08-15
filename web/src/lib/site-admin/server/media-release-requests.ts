import "server-only";

/**
 * media-release-requests.ts — the request / approve / decline / revoke rail
 * for media releases (media-ownership plan §4 V2, phase 3).
 *
 * Split out of `media-grants.ts` when that module crossed the 800-line lint
 * cap. The seam is deliberate rather than arbitrary: `media-grants.ts` answers
 * "what may this photo do?" (the predicate, the locks, the picker filter),
 * this file answers "how does that change?" (the consent workflow). Shared
 * row loaders and the notification helpers stay in `media-grants.ts` and are
 * imported here, so there is still exactly one copy of each.
 *
 * `media-grants.ts` re-exports everything below, so callers keep importing
 * from there. This file imports ONLY `media-grants-shared.ts`, never
 * `media-grants.ts` — that would be a cycle.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import {
  bustKeysFor,
  buildReleaseScopes,
  isMediaReleaseRequest,
  loadActiveGrants,
  loadSubjectAssets,
  loadTalentNames,
  loadTenantNames,
  logGrantActivity,
  notifyTalentUsers,
  notifyWorkspaceStaff,
  parseReleaseScopes,
  resolveAllHubsBustTenantIds,
  MAX_RELEASE_ASSETS,
  type MediaGrantBustKey,
  type MediaGrantResult,
} from "./media-grants-shared";
import { loadPendingReleaseAssetIds } from "./media-release-withdraw";

// ─── 2. The talent asks (writes the SUBJECT key) ────────────────────────────

export type ReleaseRequestOutcome = {
  requestId: string;
  assetCount: number;
  ownerTenantId: string;
  notified: number;
};

/**
 * Ask the owning workspace to release photos of you for use elsewhere.
 *
 * One request per owning workspace: the assets are filtered to those the
 * caller is the subject of AND that `ownerTenantId` actually owns, so a
 * crafted id list can never pull another workspace's photo into the ask.
 */
export async function requestMediaRelease(
  admin: SupabaseClient,
  input: {
    talentProfileId: string;
    talentName: string;
    ownerTenantId: string;
    targetTenantId: string | null;
    assetIds: readonly string[];
    message: string | null;
    actorUserId: string;
  },
): Promise<MediaGrantResult<ReleaseRequestOutcome>> {
  if (input.assetIds.length === 0) return { ok: false, error: "Select at least one photo." };
  if (input.assetIds.length > MAX_RELEASE_ASSETS) {
    return { ok: false, error: `Ask for at most ${MAX_RELEASE_ASSETS} photos at a time.` };
  }

  const assets = await loadSubjectAssets(admin, input.talentProfileId, input.assetIds);
  const eligible = assets.filter(
    (a) => a.ownership_kind === "agency" && a.owner_tenant_id === input.ownerTenantId,
  );
  if (eligible.length === 0) {
    return { ok: false, error: "Those photos are not this workspace's to release." };
  }
  if (input.targetTenantId && input.targetTenantId === input.ownerTenantId) {
    // Already visible there by the implicit owner key — nothing to ask for.
    return { ok: false, error: "These photos already appear on that site." };
  }

  // B11 — the duplicate guard was CLIENT-ONLY: the panel greys out a tile that
  // already has an open ask, and nothing else checked. A stale panel, a second
  // tab, or any direct call therefore filed a second card in the workspace
  // queue for photos already waiting on an answer, and staff had to guess
  // whether the two cards meant the same thing.
  //
  // Narrow the ask to the photos that are NOT already pending for the same
  // target rather than refusing the whole call: asking for A+B when B is
  // already pending should still get A moving. Only a fully duplicate ask is
  // refused, and it says so in words.
  const alreadyPending = await loadPendingReleaseAssetIds(admin, {
    talentProfileId: input.talentProfileId,
    ownerTenantId: input.ownerTenantId,
    targetTenantId: input.targetTenantId,
  });
  const eligibleIds = eligible.map((a) => a.id).filter((id) => !alreadyPending.has(id));
  if (eligibleIds.length === 0) {
    return { ok: false, error: "You have already asked for these photos." };
  }

  const { data: inserted, error } = await admin
    .from("talent_agency_permission_requests")
    .insert({
      talent_profile_id: input.talentProfileId,
      requesting_tenant_id: input.ownerTenantId,
      requested_scopes: buildReleaseScopes(eligibleIds, input.targetTenantId),
      request_message: input.message,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error || !inserted) {
    logServerError("media-grants.requestRelease", error);
    return { ok: false, error: "Could not send the request. Try again." };
  }
  const requestId = (inserted as { id: string }).id;

  // The ask IS the subject's consent — write that key now. The photo still
  // will not travel: the owner key is missing until the workspace approves.
  await insertGrants(admin, {
    assetIds: eligibleIds,
    grantKind: "subject",
    targetTenantId: input.targetTenantId,
    grantedBy: input.actorUserId,
    sourceRequestId: requestId,
  });

  await logGrantActivity(admin, input.ownerTenantId, eligibleIds, "grant.release_requested", {
    request_id: requestId,
    target_tenant_id: input.targetTenantId,
    talent_profile_id: input.talentProfileId,
    actor_user_id: input.actorUserId,
  });

  const notified = await notifyWorkspaceStaff(admin, {
    tenantId: input.ownerTenantId,
    actorUserId: input.actorUserId,
    title: `${input.talentName} asked to use ${eligibleIds.length} of your photos`,
    body: `${input.talentName} wants to show ${eligibleIds.length} photo${eligibleIds.length === 1 ? "" : "s"} you own on another site. Review the request and approve or decline it. You can revoke it later at any time.`,
  });

  return {
    ok: true,
    data: {
      requestId,
      assetCount: eligibleIds.length,
      ownerTenantId: input.ownerTenantId,
      notified,
    },
  };
}

/**
 * Insert grants, ignoring rows that already exist. The partial unique index
 * `media_grants_live_uniq` makes a duplicate a 23505 rather than a second
 * live grant, so re-asking is idempotent instead of piling up rows.
 */
async function insertGrants(
  admin: SupabaseClient,
  input: {
    assetIds: readonly string[];
    grantKind: "owner" | "subject";
    targetTenantId: string | null;
    grantedBy: string;
    sourceRequestId: string | null;
    watermarkRequired?: boolean;
  },
): Promise<void> {
  if (input.assetIds.length === 0) return;
  const scope = input.targetTenantId ? "tenant" : "all_hubs";
  for (const assetId of input.assetIds) {
    const { error } = await admin.from("media_grants").insert({
      asset_id: assetId,
      grant_kind: input.grantKind,
      scope,
      tenant_id: input.targetTenantId,
      granted_by: input.grantedBy,
      source_request_id: input.sourceRequestId,
      watermark_required: input.watermarkRequired ?? false,
    });
    // 23505 = the live grant is already there. That is success, not failure.
    if (error && (error as { code?: string }).code !== "23505") {
      logServerError("media-grants.insertGrant", error);
    }
  }
}

// ─── 3. The workspace answers (writes the OWNER key) ────────────────────────

export type MediaReleaseRequestSummary = {
  requestId: string;
  talentProfileId: string;
  talentName: string;
  assetIds: string[];
  targetTenantId: string | null;
  targetTenantName: string | null;
  message: string | null;
  requestedAt: string;
  status: string;
};

/**
 * Release requests addressed to this workspace: pending ones (to decide) plus
 * approved ones whose owner grant is still active (to revoke). Without the
 * approved rows the revoke path would be UI-orphaned the moment a request is
 * approved — the backend can revoke, but nothing on screen offers it.
 */
export async function listMediaReleaseRequests(
  admin: SupabaseClient,
  tenantId: string,
): Promise<MediaGrantResult<MediaReleaseRequestSummary[]>> {
  const { data, error } = await admin
    .from("talent_agency_permission_requests")
    .select(
      "id, talent_profile_id, requested_scopes, request_message, requested_at, status",
    )
    .eq("requesting_tenant_id", tenantId)
    .in("status", ["pending", "approved"])
    .order("requested_at", { ascending: false })
    .limit(100);

  if (error) {
    logServerError("media-grants.listRequests", error);
    return { ok: false, error: "Could not load requests. Try again." };
  }

  const rows = (
    (data ?? []) as Array<{
      id: string;
      talent_profile_id: string;
      requested_scopes: string[] | null;
      request_message: string | null;
      requested_at: string;
      status: string;
    }>
  ).filter((r) => isMediaReleaseRequest(r.requested_scopes));

  if (rows.length === 0) return { ok: true, data: [] };

  let parsed = rows.map((r) => ({ row: r, scopes: parseReleaseScopes(r.requested_scopes) }));

  // An approved request is only actionable while its owner grant is live —
  // once revoked it is history, not a card.
  const approvedAssetIds = [
    ...new Set(
      parsed.filter((p) => p.row.status === "approved").flatMap((p) => p.scopes.assetIds),
    ),
  ];
  if (approvedAssetIds.length > 0) {
    const { data: liveGrants } = await admin
      .from("media_grants")
      .select("asset_id")
      .in("asset_id", approvedAssetIds)
      .eq("grant_kind", "owner")
      .is("revoked_at", null);
    const liveIds = new Set(
      ((liveGrants ?? []) as Array<{ asset_id: string }>).map((g) => g.asset_id),
    );
    parsed = parsed.filter(
      (p) => p.row.status !== "approved" || p.scopes.assetIds.some((id) => liveIds.has(id)),
    );
  }

  if (parsed.length === 0) return { ok: true, data: [] };
  const [talentNames, tenantNames] = await Promise.all([
    loadTalentNames(admin, [...new Set(parsed.map((p) => p.row.talent_profile_id))]),
    loadTenantNames(
      admin,
      [...new Set(parsed.map((p) => p.scopes.targetTenantId).filter((x): x is string => !!x))],
    ),
  ]);

  return {
    ok: true,
    data: parsed.map(({ row, scopes }) => ({
      requestId: row.id,
      talentProfileId: row.talent_profile_id,
      talentName: talentNames.get(row.talent_profile_id) ?? "A talent",
      assetIds: scopes.assetIds,
      targetTenantId: scopes.targetTenantId,
      targetTenantName: scopes.targetTenantId
        ? (tenantNames.get(scopes.targetTenantId) ?? null)
        : null,
      message: row.request_message,
      requestedAt: row.requested_at,
      status: row.status,
    })),
  };
}

export type ReleaseDecisionOutcome = {
  granted: number;
  notified: number;
  bustKeys: MediaGrantBustKey[];
  /**
   * The asset ids the owner key was just written for. Empty on a decline.
   * Phase 4 needs them: watermark-on-release bakes the derivative at approval
   * time, and the caller cannot re-derive this list without re-running the
   * ownership filter this function already ran.
   */
  grantedAssetIds: string[];
  /** The talent the request was about — needed to repair a failed bake (A4). */
  talentProfileId: string;
  /** The hub the release points at; null = every hub. */
  targetTenantId: string | null;
  /**
   * Set by the action layer when the approval succeeded but some photos could
   * not be watermarked and were rolled back out of it (A4). Absent = clean run.
   */
  warning?: string;
  failedAssetIds?: string[];
};

/**
 * Approve or decline. Approval writes the OWNER key; with the subject key
 * already on file from the request, the photo becomes presentable on the
 * target on the next resolve.
 */
export async function decideMediaReleaseRequest(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    workspaceName: string;
    requestId: string;
    approve: boolean;
    watermarkRequired?: boolean;
    actorUserId: string;
  },
): Promise<MediaGrantResult<ReleaseDecisionOutcome>> {
  const { data, error } = await admin
    .from("talent_agency_permission_requests")
    .select("id, talent_profile_id, requested_scopes, status")
    .eq("id", input.requestId)
    // Scope on the WRITE path too, not just the read: this workspace can only
    // answer requests addressed to it.
    .eq("requesting_tenant_id", input.tenantId)
    .eq("status", "pending")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "That request is no longer open." };
  }

  const row = data as {
    id: string;
    talent_profile_id: string;
    requested_scopes: string[] | null;
  };
  const { assetIds, targetTenantId } = parseReleaseScopes(row.requested_scopes);
  if (assetIds.length === 0) return { ok: false, error: "That request is not a photo release." };

  // Re-derive eligibility at decision time — ownership may have moved since
  // the ask, and a stale scope list must not hand out a photo this workspace
  // no longer owns.
  const assets = await loadSubjectAssets(admin, row.talent_profile_id, assetIds);
  const eligibleIds = assets
    .filter((a) => a.ownership_kind === "agency" && a.owner_tenant_id === input.tenantId)
    .map((a) => a.id);

  const { error: updateErr } = await admin
    .from("talent_agency_permission_requests")
    .update({
      status: input.approve ? "approved" : "denied",
      approved_scopes: input.approve ? buildReleaseScopes(eligibleIds, targetTenantId) : [],
      responded_at: new Date().toISOString(),
      responded_by_user_id: input.actorUserId,
    })
    .eq("id", row.id)
    .eq("requesting_tenant_id", input.tenantId)
    .eq("status", "pending");

  if (updateErr) {
    logServerError("media-grants.decide", updateErr);
    return { ok: false, error: "Could not record the decision. Try again." };
  }

  if (input.approve && eligibleIds.length > 0) {
    await insertGrants(admin, {
      assetIds: eligibleIds,
      grantKind: "owner",
      targetTenantId,
      grantedBy: input.actorUserId,
      sourceRequestId: row.id,
      watermarkRequired: input.watermarkRequired,
    });
  }

  await logGrantActivity(
    admin,
    input.tenantId,
    eligibleIds,
    input.approve ? "grant.release_approved" : "grant.release_denied",
    {
      request_id: row.id,
      target_tenant_id: targetTenantId,
      talent_profile_id: row.talent_profile_id,
      actor_user_id: input.actorUserId,
      watermark_required: input.watermarkRequired ?? false,
    },
  );

  const count = eligibleIds.length;
  const notified = await notifyTalentUsers(admin, {
    talentProfileId: row.talent_profile_id,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    title: input.approve
      ? `${input.workspaceName} released ${count} photo${count === 1 ? "" : "s"} to you`
      : `${input.workspaceName} declined your photo request`,
    body: input.approve
      ? `You can now use ${count} photo${count === 1 ? "" : "s"} owned by ${input.workspaceName} outside their site. They can revoke this later, and the photos would come down.`
      : `${input.workspaceName} kept ${assetIds.length} photo${assetIds.length === 1 ? "" : "s"} to their own site. Your own uploads are unaffected. You can ask again or upload your own photos.`,
  });

  // An `all_hubs` approval has no target tenant to bust (A5) — resolve the hubs
  // that can now start showing the photo and bust each.
  const extraHubIds =
    input.approve && targetTenantId === null && eligibleIds.length > 0
      ? await resolveAllHubsBustTenantIds(admin, {
          talentProfileId: row.talent_profile_id,
          assetIds: eligibleIds,
        })
      : [];

  return {
    ok: true,
    data: {
      granted: input.approve ? count : 0,
      notified,
      bustKeys: bustKeysFor(row.talent_profile_id, input.tenantId, targetTenantId, extraHubIds),
      grantedAssetIds: input.approve ? eligibleIds : [],
      talentProfileId: row.talent_profile_id,
      targetTenantId,
    },
  };
}

/**
 * Undo the owner key on assets whose watermark bake failed (A4).
 *
 * THE STATE THIS PREVENTS. Approval writes the owner grant with
 * `watermark_required = true`, then bakes. When a bake fails — a storage blip,
 * a sharp OOM on a large file, a logo URL that 404s — the grant stays, and the
 * resolver correctly refuses to serve a watermark-required asset with no
 * derivative. The result was a release that both parties had been told
 * succeeded, showing nothing, forever, with nothing retrying it.
 *
 * Rolling the failed assets out of the approval makes the stored state match
 * what is actually servable: the photos that baked stay released, the ones that
 * did not are simply not released, and staff get told which. Re-approving after
 * fixing the cause is the retry — grants are insert-on-approve, so nothing has
 * to be cleaned up first.
 */
export async function rollBackFailedReleaseBakes(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    assetIds: readonly string[];
    targetTenantId: string | null;
    talentProfileId: string;
    actorUserId: string;
  },
): Promise<number> {
  if (input.assetIds.length === 0) return 0;

  const affected = selectGrantsToRevoke(
    await loadActiveGrants(admin, input.assetIds),
    input.targetTenantId,
  );
  if (affected.length === 0) return 0;

  const { error } = await admin
    .from("media_grants")
    .update({ revoked_at: new Date().toISOString() })
    .in(
      "id",
      affected.map((g) => g.id),
    )
    .is("revoked_at", null);

  if (error) {
    logServerError("media-grants.rollBackFailedBakes", error);
    return 0;
  }

  await logGrantActivity(admin, input.tenantId, input.assetIds, "grant.release_bake_failed", {
    talent_profile_id: input.talentProfileId,
    target_tenant_id: input.targetTenantId,
    actor_user_id: input.actorUserId,
    rolled_back_grants: affected.length,
  });

  return affected.length;
}

// ─── 4. Revoke — stop showing the photo, per target ─────────────────────────

export type ReleaseRevokeOutcome = {
  revoked: number;
  notified: number;
  bustKeys: MediaGrantBustKey[];
  /** Null when the revoke was an "everywhere" one. Echoes the scope acted on. */
  revokedTargetTenantId: string | null;
};

/** PURE — which of these active owner grants does a revoke of `target` end?
 *
 * `target === null` is the "everywhere" revoke: it ends every owner grant on
 * the asset, including tenant-scoped ones. A named target ends only grants
 * pointed at THAT hub — an `all_hubs` grant is deliberately left alone,
 * because narrowing "anywhere" down to "anywhere except B" is not a state the
 * table can hold, and silently ending it would take the photo off C and D too
 * (that is the A6 bug, in the other direction).
 */
export function selectGrantsToRevoke<T extends { grant_kind: string; tenant_id: string | null }>(
  grants: readonly T[],
  target: string | null,
): T[] {
  const owner = grants.filter((g) => g.grant_kind === "owner");
  if (target === null) return owner;
  return owner.filter((g) => g.tenant_id === target);
}

/**
 * Pull a release back.
 *
 * WHAT REVOCATION ACTUALLY DOES (D-4a). It is a PRESENTATION control, not an
 * access control. Clearing the owner key means the one resolver stops
 * SELECTING that photo, so it disappears from cards and galleries on the next
 * resolve. It does not make the bytes unreachable: all live media sits in a
 * `public = true` bucket at a stable URL, so anyone who already saved, copied
 * or embedded that URL keeps being able to fetch it. Real takedown needs a
 * private bucket plus a per-request proxy (plan P0-1 option b), which is not
 * built. Do not describe this as "un-publishes everywhere" anywhere a customer
 * can read it.
 *
 * SCOPE (A6 / D-6). `targetTenantId` names the hub to end the release to,
 * matching the per-hub card the staff member clicked. Before this, the UPDATE
 * carried no tenant filter at all, so ending a release to hub B also revoked
 * the live releases to C and D, silently, with a success message.
 *
 * `targetTenantId: null` (or omitted) keeps the old "everywhere" behaviour,
 * which is the correct semantic for revoking an `all_hubs` release: everywhere
 * IS its target.
 *
 * The subject's own key is deliberately left alone — it is not this
 * workspace's to withdraw.
 */
export async function revokeMediaRelease(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    workspaceName: string;
    talentProfileId: string;
    assetIds: readonly string[];
    actorUserId: string;
    /**
     * The hub whose release is ending. Omit or pass null to end the release
     * everywhere (the right call for an `all_hubs` grant).
     */
    targetTenantId?: string | null;
  },
): Promise<MediaGrantResult<ReleaseRevokeOutcome>> {
  const target = input.targetTenantId ?? null;
  if (input.assetIds.length === 0) {
    return {
      ok: true,
      data: { revoked: 0, notified: 0, bustKeys: [], revokedTargetTenantId: target },
    };
  }
  if (input.assetIds.length > MAX_RELEASE_ASSETS) {
    return { ok: false, error: `Revoke at most ${MAX_RELEASE_ASSETS} photos at a time.` };
  }

  // Only this workspace's own assets — a revoke must never reach into
  // another owner's grants.
  const assets = await loadSubjectAssets(admin, input.talentProfileId, input.assetIds);
  const ownedIds = assets
    .filter((a) => a.ownership_kind === "agency" && a.owner_tenant_id === input.tenantId)
    .map((a) => a.id);
  if (ownedIds.length === 0) return { ok: false, error: "Those photos are not yours to revoke." };

  const affected = selectGrantsToRevoke(await loadActiveGrants(admin, ownedIds), target);
  if (affected.length === 0) {
    return { ok: false, error: "There is no live release to end for that site." };
  }

  // Scoped by id rather than by (asset, kind) so the UPDATE touches exactly the
  // rows the pure selector just picked. A tenant filter alone could not express
  // "this target, but not the all_hubs row".
  const { error } = await admin
    .from("media_grants")
    .update({ revoked_at: new Date().toISOString() })
    .in(
      "id",
      affected.map((g) => g.id),
    )
    .is("revoked_at", null);

  if (error) {
    logServerError("media-grants.revoke", error);
    return { ok: false, error: "Could not revoke. Try again." };
  }

  const revokedAssetIds = [...new Set(affected.map((g) => g.asset_id))];
  await logGrantActivity(admin, input.tenantId, revokedAssetIds, "grant.release_revoked", {
    talent_profile_id: input.talentProfileId,
    actor_user_id: input.actorUserId,
    target_tenant_id: target,
    revoked_grants: affected.length,
  });

  // Name the hub when there is one. "Ended everywhere" and "ended on Impronta"
  // are very different messages to receive, and the old copy sent the first one
  // for both.
  const targetName = target ? (await loadTenantNames(admin, [target])).get(target) : null;
  const where = target
    ? `on ${targetName ?? "that site"}`
    : `on sites outside ${input.workspaceName}`;
  const count = affected.length;
  const notified = await notifyTalentUsers(admin, {
    talentProfileId: input.talentProfileId,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    title: `${input.workspaceName} ended a photo release`,
    body: `${count} photo${count === 1 ? "" : "s"} owned by ${input.workspaceName} will stop being shown ${where}. Your own photos are not affected. Copies anyone already saved or linked to are outside this control.`,
  });

  // Cache busting. A tenant-scoped grant names its hub; an `all_hubs` grant
  // carries tenant_id NULL by check constraint, so the hubs that were showing
  // the photo have to be resolved (A5) or they keep serving it until their own
  // cache expires.
  const namedTargets = [...new Set(affected.map((g) => g.tenant_id))];
  const extraHubIds = namedTargets.includes(null)
    ? await resolveAllHubsBustTenantIds(admin, {
        talentProfileId: input.talentProfileId,
        assetIds: revokedAssetIds,
      })
    : [];

  const seen = new Set<string>();
  const bustKeys: MediaGrantBustKey[] = [];
  for (const named of namedTargets) {
    for (const key of bustKeysFor(input.talentProfileId, input.tenantId, named, extraHubIds)) {
      if (seen.has(key.tenantId)) continue;
      seen.add(key.tenantId);
      bustKeys.push(key);
    }
  }

  return {
    ok: true,
    data: { revoked: count, notified, bustKeys, revokedTargetTenantId: target },
  };
}
