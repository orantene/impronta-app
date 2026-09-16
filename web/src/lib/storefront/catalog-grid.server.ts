"use server";

/** catalog_grid — the server action the island imports dynamically. */

import type { SupabaseClient } from "@supabase/supabase-js";

import { livePhasePrice } from "@/lib/catalog/price-phases";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import type { StorefrontAdmin } from "./admin";
import { readCatalogGridCore } from "./catalog-grid.core";
import type { CatalogGridData, CatalogGridProps } from "./catalog-grid.types";
import { storefrontLocale } from "./request-context";

/** Hero-first image urls per offering, the same join the offerings editor uses. */
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

export async function readCatalogGrid(
  tenantId: string,
  props: CatalogGridProps,
): Promise<{ ok: true; data: CatalogGridData } | { ok: false; reason: string }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };
    return await readCatalogGridCore(
      { admin, locale: await storefrontLocale(props.locale), livePrice: livePhasePrice, loadImages: loadOfferingImageUrls },
      tenantId,
      props,
    );
  } catch (error) {
    logServerError("storefront.catalogGrid.read", error);
    return { ok: false, reason: "unavailable" };
  }
}
