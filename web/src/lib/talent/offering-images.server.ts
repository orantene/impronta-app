import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Hero-first image assets for a set of offerings in one query (id + public URL). */
export async function loadOfferingImageAssets(
  admin: SupabaseClient,
  offeringIds: string[],
): Promise<Map<string, { id: string; url: string; alt: string | null }[]>> {
  const out = new Map<string, { id: string; url: string; alt: string | null }[]>();
  if (offeringIds.length === 0) return out;
  const { data } = await admin
    .from("talent_offering_media")
    .select("offering_id, sort_order, media_asset_id, media_assets:media_asset_id ( public_url, bucket_id, storage_path, alt )")
    .in("offering_id", offeringIds)
    .order("sort_order", { ascending: true });
  type MediaJoin = { public_url: string | null; bucket_id: string | null; storage_path: string | null; alt?: string | null };
  type Row = { offering_id: string; media_asset_id: string; media_assets: MediaJoin | MediaJoin[] | null };
  for (const r of (data ?? []) as unknown as Row[]) {
    const m = Array.isArray(r.media_assets) ? r.media_assets[0] : r.media_assets;
    if (!m) continue;
    let url = m.public_url ?? null;
    if (!url && m.bucket_id === "media-public" && m.storage_path) {
      url = admin.storage.from("media-public").getPublicUrl(m.storage_path).data.publicUrl;
    }
    if (!url) continue;
    const list = out.get(r.offering_id) ?? [];
    list.push({ id: r.media_asset_id, url, alt: typeof m.alt === "string" && m.alt.trim() ? m.alt : null });
    out.set(r.offering_id, list);
  }
  return out;
}
