import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import type { PhotoChoice } from "./entry-photos";

/**
 * Photos per offering (hero first), with the media id the entry stores. Offerings belong to
 * talents, not to the tenant, so this reads by the ids the tenant's own listings name.
 * Returns null on a failed read: callers fail closed (no picker, no photo change).
 */
export async function loadOfferingPhotoChoices(
  admin: SupabaseClient,
  offeringIds: readonly string[],
): Promise<Map<string, PhotoChoice[]> | null> {
  const out = new Map<string, PhotoChoice[]>();
  if (offeringIds.length === 0) return out;
  const { data, error } = await admin
    .from("talent_offering_media")
    .select("offering_id, sort_order, media_asset_id, media_assets:media_asset_id ( public_url, bucket_id, storage_path )")
    .in("offering_id", [...offeringIds])
    .order("sort_order", { ascending: true });
  if (error) {
    logServerError("serviceHub.entryPhotos", error);
    return null;
  }
  type Join = { public_url: string | null; bucket_id: string | null; storage_path: string | null };
  for (const r of (data ?? []) as Array<{ offering_id: string; media_asset_id: string; media_assets: Join | Join[] | null }>) {
    const m = Array.isArray(r.media_assets) ? r.media_assets[0] : r.media_assets;
    if (!m || !r.media_asset_id) continue;
    let url = m.public_url ?? null;
    if (!url && m.bucket_id === "media-public" && m.storage_path) {
      url = admin.storage.from("media-public").getPublicUrl(m.storage_path).data.publicUrl;
    }
    if (!url) continue;
    out.set(r.offering_id, [...(out.get(r.offering_id) ?? []), { mediaId: r.media_asset_id, url }]);
  }
  return out;
}
