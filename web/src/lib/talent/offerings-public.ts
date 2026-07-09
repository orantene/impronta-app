import "server-only";

/**
 * Public storefront loader — the offerings a VISITOR may see on /t/[code].
 *
 * Server-only (imported by the public profile page). Uses the service-role
 * client for one cheap query but re-applies the public-visibility filter in
 * code (published ∧ approved ∧ not agency_only), matching the table's anon
 * RLS policy exactly — so this loader can never leak more than anon RLS would.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  rowToOffering,
  type TalentOffering,
  type TalentOfferingRow,
} from "@/lib/talent/offerings-types";

export async function loadPublicOfferingsForProfile(
  talentProfileId: string,
  locale: string,
): Promise<TalentOffering[]> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return [];
    const db = admin;

    const { data, error } = await db
      .from("talent_offerings")
      .select("*")
      .eq("talent_profile_id", talentProfileId)
      .eq("status", "published")
      .eq("moderation_state", "approved")
      .in("visibility", ["public", "on_request"])
      .order("sort_order", { ascending: true });
    if (error) {
      logServerError("public.offerings.load", error);
      return [];
    }
    const rows = (data ?? []) as TalentOfferingRow[];
    if (rows.length === 0) return [];

    const { data: mediaRows } = await db
      .from("talent_offering_media")
      .select("offering_id, sort_order, media_assets:media_asset_id ( public_url, bucket_id, storage_path )")
      .in("offering_id", rows.map((r) => r.id))
      .order("sort_order", { ascending: true });
    type MediaJoin = { public_url: string | null; bucket_id: string | null; storage_path: string | null };
    type MediaRow = { offering_id: string; media_assets: MediaJoin | MediaJoin[] | null };
    const images = new Map<string, string[]>();
    for (const r of (mediaRows ?? []) as MediaRow[]) {
      const m = Array.isArray(r.media_assets) ? r.media_assets[0] : r.media_assets;
      if (!m) continue;
      // Canonical resolution (matches talent-dashboard-data): public_url when
      // set, else the media-public bucket's storage public URL.
      let url = m.public_url ?? null;
      if (!url && m.bucket_id === "media-public" && m.storage_path) {
        url = db.storage.from("media-public").getPublicUrl(m.storage_path).data.publicUrl;
      }
      if (!url) continue;
      const list = images.get(r.offering_id) ?? [];
      list.push(url);
      images.set(r.offering_id, list);
    }
    return rows.map((r) => rowToOffering(r, locale, images.get(r.id) ?? []));
  } catch (err) {
    logServerError("public.offerings.load", err);
    return [];
  }
}
