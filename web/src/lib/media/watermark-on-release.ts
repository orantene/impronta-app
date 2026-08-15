import "server-only";

/**
 * watermark-on-release.ts — the READ side of `media_grants.watermark_required`.
 *
 * Phase 3 added the column and wrote it; nothing read it. Phase 4 closes the
 * loop: when a workspace approves a release with "require watermark" ticked,
 * the photo may appear on the receiving hub ONLY as the baked derivative.
 *
 * HOW THE SWAP WORKS
 * ──────────────────
 * The derivative is an ordinary `media_assets` row —
 * `variant_kind='watermarked'`, `source_media_asset_id` = the original — so
 * "serve the watermarked version" is a storage-path substitution, not a
 * separate rendering path. Every surface that already goes through the hub
 * resolver gets it for free.
 *
 * The set of assets under the condition comes from ONE SQL function
 * (`media_assets_watermark_required_on_tenant`, migration 20261116000000), for
 * the same reason the two-key predicate does: grant scope matching must not be
 * re-derived in TypeScript.
 *
 * WHY A MISSING DERIVATIVE HIDES THE PHOTO
 * ────────────────────────────────────────
 * The rest of this resolver family fails OPEN — a broken query must never
 * blank a storefront. This one branch does NOT, and the difference is
 * deliberate:
 *
 *   • a QUERY ERROR is still fail-open (no swaps, no drops) — an outage must
 *     not un-publish a live site;
 *   • a MISSING DERIVATIVE is a policy state, not an outage. The bake runs at
 *     approval time; if the file is not there, serving the bare original would
 *     break the exact promise the workspace made when it ticked the box. So
 *     the asset is dropped, the resolver falls through to the next-best photo,
 *     and the card degrades instead of leaking.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

/** `null` tenant = the master surface (Tulala Digital / global Discover). */
export type WatermarkSurface = string | null;

export type WatermarkPolicy = {
  /** original asset id → storage path of the baked derivative to serve instead. */
  substitutions: Map<string, string>;
  /** Assets that require a watermark but have no baked derivative yet. */
  unavailable: Set<string>;
};

export const EMPTY_WATERMARK_POLICY: WatermarkPolicy = {
  substitutions: new Map(),
  unavailable: new Set(),
};

/**
 * Which of these assets must be watermarked on this surface, and what should
 * be served in their place.
 *
 * Fail-open on error: an empty policy means "nothing changes".
 */
export async function resolveWatermarkPolicy(
  client: SupabaseClient,
  assetIds: readonly string[],
  tenantId: WatermarkSurface,
): Promise<WatermarkPolicy> {
  if (assetIds.length === 0) return EMPTY_WATERMARK_POLICY;

  const { data, error } = await client.rpc("media_assets_watermark_required_on_tenant", {
    p_asset_ids: [...new Set(assetIds)],
    p_tenant_id: tenantId,
  });

  if (error || !Array.isArray(data)) return EMPTY_WATERMARK_POLICY;

  const required = (data as Array<{ asset_id: string } | string>).map((row) =>
    typeof row === "string" ? row : row.asset_id,
  );
  if (required.length === 0) return EMPTY_WATERMARK_POLICY;

  const paths = await loadWatermarkedVariantPaths(client, required);
  if (!paths) return EMPTY_WATERMARK_POLICY;

  const substitutions = new Map<string, string>();
  const unavailable = new Set<string>();
  for (const assetId of required) {
    const path = paths.get(assetId);
    if (path) substitutions.set(assetId, path);
    else unavailable.add(assetId);
  }
  return { substitutions, unavailable };
}

/**
 * Baked derivative storage paths for a batch of originals — one round trip,
 * not N.
 *
 * Deliberately NOT imported from `watermark-bake.ts`: that module pulls in
 * `sharp`, and this one is on the hot read path of every card surface. A
 * native image codec has no business being loaded to render a thumbnail.
 */
async function loadWatermarkedVariantPaths(
  client: SupabaseClient,
  sourceAssetIds: readonly string[],
): Promise<Map<string, string> | null> {
  const out = new Map<string, string>();
  if (sourceAssetIds.length === 0) return out;

  const { data, error } = await client
    .from("media_assets")
    .select("source_media_asset_id, storage_path")
    .in("source_media_asset_id", sourceAssetIds as string[])
    .eq("variant_kind", "watermarked")
    .is("deleted_at", null);

  // null, not an empty map: an empty map would read as "no derivative exists"
  // and hide every conditioned photo on a transient query failure.
  if (error) {
    logServerError("watermark-on-release.loadVariantPaths", error);
    return null;
  }
  for (const row of (data ?? []) as Array<{
    source_media_asset_id: string | null;
    storage_path: string | null;
  }>) {
    if (row.source_media_asset_id && row.storage_path) {
      out.set(row.source_media_asset_id, row.storage_path);
    }
  }
  return out;
}

/** PURE — is this asset servable on the surface the policy was built for? */
export function isWatermarkServable(policy: WatermarkPolicy, assetId: string): boolean {
  return !policy.unavailable.has(assetId);
}

/**
 * PURE — the storage path to actually serve for this asset. Returns `null`
 * when the asset must not be served at all (watermark required, none baked).
 */
export function applyWatermarkPath(
  policy: WatermarkPolicy,
  assetId: string,
  originalPath: string,
): string | null {
  if (policy.unavailable.has(assetId)) return null;
  return policy.substitutions.get(assetId) ?? originalPath;
}
