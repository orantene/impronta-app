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
  loadTenantNames,
  logGrantActivity,
  notifyTalentUsers,
  notifyWorkspaceStaff,
  parseReleaseScopes,
  MAX_RELEASE_ASSETS,
  type MediaGrantBustKey,
  type MediaGrantResult,
} from "./media-grants-shared";

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

  const eligibleIds = eligible.map((a) => a.id);
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

async function loadTalentNames(
  admin: SupabaseClient,
  talentIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (talentIds.length === 0) return out;
  const { data } = await admin
    .from("talent_profiles")
    .select("id, display_name")
    .in("id", talentIds as string[]);
  for (const row of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
    if (row.display_name) out.set(row.id, row.display_name);
  }
  return out;
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

  return {
    ok: true,
    data: {
      granted: input.approve ? count : 0,
      notified,
      bustKeys: bustKeysFor(row.talent_profile_id, input.tenantId, targetTenantId),
      grantedAssetIds: input.approve ? eligibleIds : [],
    },
  };
}

// ─── 4. Revoke — un-publish everywhere ──────────────────────────────────────

export type ReleaseRevokeOutcome = {
  revoked: number;
  notified: number;
  bustKeys: MediaGrantBustKey[];
};

/**
 * Pull a release back. Sets `revoked_at` on this workspace's OWNER grants for
 * these assets, which is enough on its own: the predicate needs both keys, so
 * dropping the owner key un-publishes the photo on the next resolve on EVERY
 * surface, because there is only one resolver. The caller then busts the tags
 * so "next resolve" means now rather than whenever the cache expires.
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
  },
): Promise<MediaGrantResult<ReleaseRevokeOutcome>> {
  if (input.assetIds.length === 0) return { ok: true, data: { revoked: 0, notified: 0, bustKeys: [] } };
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

  const affected = (await loadActiveGrants(admin, ownedIds)).filter(
    (g) => g.grant_kind === "owner",
  );

  const { error } = await admin
    .from("media_grants")
    .update({ revoked_at: new Date().toISOString() })
    .in("asset_id", ownedIds)
    .eq("grant_kind", "owner")
    .is("revoked_at", null);

  if (error) {
    logServerError("media-grants.revoke", error);
    return { ok: false, error: "Could not revoke. Try again." };
  }

  await logGrantActivity(admin, input.tenantId, ownedIds, "grant.release_revoked", {
    talent_profile_id: input.talentProfileId,
    actor_user_id: input.actorUserId,
    revoked_grants: affected.length,
  });

  const notified = await notifyTalentUsers(admin, {
    talentProfileId: input.talentProfileId,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    title: `${input.workspaceName} ended a photo release`,
    body: `${affected.length} photo${affected.length === 1 ? "" : "s"} owned by ${input.workspaceName} no longer appear outside their site. Your own photos are not affected.`,
  });

  const targets = [...new Set(affected.map((g) => g.tenant_id))];
  const bustKeys: MediaGrantBustKey[] = [];
  for (const target of targets) {
    for (const key of bustKeysFor(input.talentProfileId, input.tenantId, target)) {
      bustKeys.push(key);
    }
  }

  return { ok: true, data: { revoked: affected.length, notified, bustKeys } };
}
