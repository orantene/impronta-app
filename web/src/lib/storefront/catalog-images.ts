import "server-only";

/**
 * Hero-first image urls per offering, the same join the offerings editor
 * uses (`talent_offering_media` → `media_assets`). Server-only and NOT a
 * server action: it takes a client, and a "use server" export would turn it
 * into an endpoint.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { StorefrontAdmin } from "./admin";

export async function loadOfferingImageUrls(
  admin: StorefrontAdmin,
  offeringIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (offeringIds.length === 0) return out;
  const { data, error } = await admin
    .from("talent_offering_media")
    .select("offering_id, sort_order, media_asset_id, media_assets:media_asset_id ( public_url, bucket_id, storage_path )")
    .in("offering_id", offeringIds)
    .order("sort_order", { ascending: true });
  if (error) return out;
  type MediaJoin = { public_url: string | null; bucket_id: string | null; storage_path: string | null };
  type Row = { offering_id: string; media_assets: MediaJoin | MediaJoin[] | null };
  for (const r of (data ?? []) as Row[]) {
    const m = Array.isArray(r.media_assets) ? r.media_assets[0] : r.media_assets;
    if (!m) continue;
    let url = m.public_url ?? null;
    if (!url && m.bucket_id === "media-public" && m.storage_path) {
      url = (admin as SupabaseClient).storage.from("media-public").getPublicUrl(m.storage_path).data.publicUrl;
    }
    if (!url) continue;
    out.set(r.offering_id, [...(out.get(r.offering_id) ?? []), url]);
  }
  return out;
}

