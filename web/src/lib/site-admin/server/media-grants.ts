import "server-only";

/**
 * media-grants.ts — what may this photo do, and where? (phase 3, plan §P2)
 *
 * The two-key rule says an agency-owned photo of a talent does not travel to a
 * third hub on its own. This module answers the READ side of that: the locked
 * tiles a talent sees, and the picker filter that stops a surface from
 * offering a photo the rule forbids.
 *
 * The verdict itself always comes from the ONE SQL predicate
 * (`media_asset_presentable_on_tenant`, migration 20261115000000). Nothing
 * here re-derives it — only the human-readable REASON is computed in TS.
 *
 * The WRITE side (request / approve / decline / revoke) lives in
 * `media-release-requests.ts`; shared loaders live in `media-grants-shared.ts`.
 * This file re-exports both, so `media-grants` stays the single import path.
 *
 * KIND-AGNOSTIC (M1): tenant ids are opaque. Nothing asks whether an org is an
 * agency or a hub; `ownership_kind === 'agency'` is a MEDIA ownership value,
 * not an org kind.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import {
  loadActiveGrants,
  loadTenantNames,
  parseReleaseScopes,
  type MediaGrantResult,
} from "./media-grants-shared";

export * from "./media-grants-shared";

// ─── 1. Locked tiles: what may this talent do with each photo of them? ──────

export type TalentMediaLock = {
  assetId: string;
  /** Renderable image URL — a locked tile is VISIBLE, just not usable. */
  url: string;
  alt: string;
  /** Workspace that owns the photo (agency-owned assets only). */
  ownerTenantId: string;
  ownerTenantName: string;
  /** True once an owner grant covers a hub beyond the owner's own. */
  released: boolean;
  /** A release request is already awaiting an answer. */
  pending: boolean;
};

/**
 * Every agency-owned photo OF this talent, with its lock state. Talent-owned
 * photos are deliberately absent: they are not locked, so a tile for them
 * would be noise.
 */
export async function loadTalentMediaLocks(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<MediaGrantResult<TalentMediaLock[]>> {
  const { data, error } = await admin
    .from("media_assets")
    .select("id, owner_tenant_id, storage_path, bucket_id, alt")
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("ownership_kind", "agency")
    .not("owner_tenant_id", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    logServerError("media-grants.loadTalentMediaLocks", error);
    return { ok: false, error: "Could not load your photos. Try again." };
  }

  const rows = (data ?? []) as Array<{
    id: string;
    owner_tenant_id: string;
    storage_path: string | null;
    bucket_id: string | null;
    alt: string | null;
  }>;
  if (rows.length === 0) return { ok: true, data: [] };

  const assetIds = rows.map((r) => r.id);
  const [grants, pendingIds, names] = await Promise.all([
    loadActiveGrants(admin, assetIds),
    loadPendingRequestAssetIds(admin, talentProfileId),
    loadTenantNames(admin, [...new Set(rows.map((r) => r.owner_tenant_id))]),
  ]);

  const releasedAssetIds = new Set(
    grants.filter((g) => g.grant_kind === "owner").map((g) => g.asset_id),
  );

  return {
    ok: true,
    data: rows.map((row) => ({
      assetId: row.id,
      url: publicUrl(admin, row.bucket_id, row.storage_path),
      alt: row.alt ?? "",
      ownerTenantId: row.owner_tenant_id,
      ownerTenantName: names.get(row.owner_tenant_id) ?? "a workspace",
      released: releasedAssetIds.has(row.id),
      pending: pendingIds.has(row.id),
    })),
  };
}

/**
 * Storage path → renderable URL. Absolute and root-relative paths pass through
 * untouched (seeded avatars and the free-starter portraits store those), the
 * same guard `mediaPublicUrl` applies on the card path.
 */
function publicUrl(
  admin: SupabaseClient,
  bucketId: string | null,
  storagePath: string | null,
): string {
  if (!storagePath) return "";
  if (storagePath.startsWith("http") || storagePath.startsWith("/")) return storagePath;
  return admin.storage.from(bucketId ?? "media-public").getPublicUrl(storagePath).data.publicUrl;
}


async function loadPendingRequestAssetIds(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from("talent_agency_permission_requests")
    .select("requested_scopes")
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "pending");
  if (error) {
    logServerError("media-grants.loadPending", error);
    return new Set();
  }
  const out = new Set<string>();
  for (const row of (data ?? []) as Array<{ requested_scopes: string[] | null }>) {
    for (const id of parseReleaseScopes(row.requested_scopes).assetIds) out.add(id);
  }
  return out;
}

// ─── 1b. Picker filter: which of these may the talent actually use? ─────────

/** Why a tile is locked. `null` = usable. Kept as a code so UI can translate. */
export type MediaLockReason = "owned_by_workspace" | "master_profile_off" | null;

export type MediaUsability = {
  assetId: string;
  usable: boolean;
  reason: MediaLockReason;
  /** Owning workspace name, for the explanation. Null when talent-owned. */
  ownerTenantName: string | null;
};

/**
 * Partition a talent's assets into usable / locked FOR A GIVEN SURFACE, so a
 * picker can grey out what it must not offer AND say why.
 *
 * `tenantId === null` = the master profile. Plan §6: "never a silent absence"
 * — the picker explains every locked tile, because a photo that just quietly
 * is not there is the "I save and nothing changes" incident class.
 *
 * The verdict comes from the SQL predicate, not from a second copy of the
 * rule; only the human-readable REASON is derived here.
 */
export async function classifyTalentMediaUsability(
  admin: SupabaseClient,
  input: { talentProfileId: string; assetIds: readonly string[]; tenantId: string | null },
): Promise<MediaUsability[]> {
  if (input.assetIds.length === 0) return [];

  const { data, error } = await admin
    .from("media_assets")
    .select("id, ownership_kind, owner_tenant_id, visible_on_master_profile")
    .in("id", input.assetIds as string[])
    .eq("owner_talent_profile_id", input.talentProfileId)
    .is("deleted_at", null);

  if (error) {
    logServerError("media-grants.classifyUsability", error);
    // Fail OPEN, exactly like the resolver: a broken query must not make a
    // talent's own photo library look confiscated.
    return input.assetIds.map((assetId) => ({
      assetId,
      usable: true,
      reason: null,
      ownerTenantName: null,
    }));
  }

  const rows = (data ?? []) as Array<{
    id: string;
    ownership_kind: string | null;
    owner_tenant_id: string | null;
    visible_on_master_profile: boolean | null;
  }>;

  const [allowed, names] = await Promise.all([
    presentableAssetIds(admin, rows.map((r) => r.id), input.tenantId),
    loadTenantNames(
      admin,
      [...new Set(rows.map((r) => r.owner_tenant_id).filter((x): x is string => !!x))],
    ),
  ]);

  return rows.map((row) => {
    const usable = allowed.has(row.id);
    let reason: MediaLockReason = null;
    if (!usable) {
      reason =
        row.ownership_kind === "agency" && row.visible_on_master_profile === false && input.tenantId === null
          ? "master_profile_off"
          : "owned_by_workspace";
    }
    return {
      assetId: row.id,
      usable,
      reason,
      ownerTenantName: row.owner_tenant_id ? (names.get(row.owner_tenant_id) ?? null) : null,
    };
  });
}

/**
 * Call THE predicate. This is the only place the app asks "may this appear
 * here?" outside the resolver, and it asks the same SQL function rather than
 * re-deriving the answer.
 *
 * Fail-open on error, for the same reason the resolver is.
 */
async function presentableAssetIds(
  admin: SupabaseClient,
  assetIds: readonly string[],
  tenantId: string | null,
): Promise<Set<string>> {
  if (assetIds.length === 0) return new Set();
  const { data, error } = await admin.rpc("media_assets_presentable_on_tenant", {
    p_asset_ids: assetIds as string[],
    p_tenant_id: tenantId,
  });
  if (error || !Array.isArray(data)) {
    logServerError("media-grants.presentableAssetIds", error);
    return new Set(assetIds);
  }
  return new Set(
    (data as Array<{ asset_id: string } | string>).map((row) =>
      typeof row === "string" ? row : row.asset_id,
    ),
  );
}

// ─── the release rail ───────────────────────────────────────────────────────
//
// Request / decide / revoke moved to `media-release-requests.ts` when this
// module crossed the 800-line lint cap. Re-exported here so `media-grants` is
// still the one import path callers reach for.

export {
  requestMediaRelease,
  listMediaReleaseRequests,
  decideMediaReleaseRequest,
  revokeMediaRelease,
  type ReleaseRequestOutcome,
  type MediaReleaseRequestSummary,
  type ReleaseDecisionOutcome,
  type ReleaseRevokeOutcome,
} from "./media-release-requests";
