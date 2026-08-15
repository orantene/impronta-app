import "server-only";

/**
 * gated-media-access.ts — the per-request verdict behind `/api/media/asset`.
 *
 * Lives here rather than in the route handler for the reason every other
 * decision in this program does: a verdict that can only be reached by making
 * an HTTP request is a verdict nobody tests. The route is auth + parse +
 * headers; this module is the decision.
 *
 * ONE PREDICATE, ONE PLACE
 * ────────────────────────
 * It does NOT re-derive who may see what. It calls
 * `filterPresentableAssetIds()` — the same function the hub resolver calls,
 * which calls the same SQL predicate the storefront calls — and
 * `resolveWatermarkPolicy()` for the same reason. If the rule ever changes it
 * changes in SQL and both the render path and the byte path move together.
 * Two readers of one rule disagreeing is the exact failure this codebase has
 * paid for repeatedly (`is_publicly_listed`, 2026-08).
 *
 * NO SILENT FALLBACK TO THE ORIGINAL
 * ──────────────────────────────────
 * Every refusal path here returns a refusal. In particular a
 * watermark-required asset whose derivative was never baked is REFUSED, never
 * served bare — that is the same stance `watermark-on-release.ts` takes on the
 * render side, and the whole point of the gate is that the two sides agree.
 *
 * A predicate outage is also a refusal. `filterPresentableAssetIds` fails
 * closed (Batch A / A3) and this module inherits that: the render path can
 * afford to degrade to a default photo, but a gate that opens when its check
 * is unavailable is not a gate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyWatermarkPath, resolveWatermarkPolicy } from "@/lib/media/watermark-on-release";
import { filterPresentableAssetIds } from "@/lib/media/talent-media-for-hub";
import type { MediaSurface } from "@/lib/media/private-access";
import { logServerError } from "@/lib/server/safe-error";

const DEFAULT_BUCKET = "media-public";

/** Stable codes for logs, tests, and the response body. Never shown to a person. */
export type GatedMediaDenyReason =
  | "asset_not_found"
  | "not_presentable"
  | "watermark_unavailable";

export type GatedMediaDecision =
  | {
      ok: true;
      /** Bucket + path to sign. Already watermark-substituted. */
      bucket: string;
      storagePath: string;
      /** True when the served path is a baked derivative, not the original. */
      watermarked: boolean;
    }
  | { ok: false; reason: GatedMediaDenyReason };

type AssetRow = {
  id: string;
  storage_path: string | null;
  bucket_id: string | null;
};

/**
 * May `surface` fetch the bytes of `assetId`, and which object should it get?
 *
 * `client` must be able to read `media_assets` across tenants (service role):
 * the gate answers for anonymous visitors on public storefronts, so there is
 * no session to scope the read by. The DECISION is not widened by that — it is
 * made entirely by the predicate, which is auth-independent and takes only
 * (asset, surface).
 */
export async function resolveGatedMediaAccess(
  client: SupabaseClient,
  input: { assetId: string; surface: MediaSurface },
): Promise<GatedMediaDecision> {
  const { assetId, surface } = input;

  const { data, error } = await client
    .from("media_assets")
    .select("id, storage_path, bucket_id")
    .eq("id", assetId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    // Indistinguishable from "no such asset" on the wire, on purpose: a gate
    // that tells you the difference between "denied" and "does not exist" is
    // an existence oracle for asset ids.
    logServerError("gated-media-access.loadAsset", error);
    return { ok: false, reason: "asset_not_found" };
  }

  const asset = data as AssetRow | null;
  if (!asset?.storage_path) return { ok: false, reason: "asset_not_found" };

  const allowed = await filterPresentableAssetIds(client, [assetId], surface);
  if (!allowed.has(assetId)) return { ok: false, reason: "not_presentable" };

  const policy = await resolveWatermarkPolicy(client, [assetId], surface);
  const servePath = applyWatermarkPath(policy, assetId, asset.storage_path);
  if (!servePath) return { ok: false, reason: "watermark_unavailable" };

  return {
    ok: true,
    bucket: asset.bucket_id ?? DEFAULT_BUCKET,
    storagePath: servePath,
    watermarked: servePath !== asset.storage_path,
  };
}
