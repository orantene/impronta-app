/**
 * resolveSharperBanner — swap a small, hand-cropped `hero` asset for its
 * full-resolution source when the source is meaningfully larger.
 *
 * Until 2026-09-20 the upload pipeline capped `hero` masters at 1400px (the
 * cap was sized for a 4:5 cover card), while the profile templates paint the
 * hero full-bleed across the viewport. Every hero stored before the cap was
 * raised is 900–1400px wide and reads as low quality on a Retina screen.
 * Heroes are crops of a gallery asset (`source_media_asset_id`); when that
 * source is ≥ 1.25× wider the templates get the sharper source and frame it
 * with CSS (`object-position`) instead of the baked crop. New heroes cropped
 * after the cap change keep their crop: they are wide enough on their own.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const SHARP_HERO_MIN_WIDTH = 1600;

type MediaLike = {
  id: string;
  bucket_id: string | null;
  storage_path: string | null;
  width: number | null;
  height: number | null;
  variant_kind: string | null;
  sort_order: number | null;
  source_media_asset_id?: string | null;
};

export async function resolveSharperBanner<T extends MediaLike>(
  pub: SupabaseClient | null,
  hero: T | null,
): Promise<T | null> {
  if (!pub || !hero || !hero.width || hero.width >= SHARP_HERO_MIN_WIDTH) return hero;
  if (!hero.source_media_asset_id) return hero;
  const { data, error } = await pub
    .from("media_assets")
    .select("id, bucket_id, storage_path, width, height, variant_kind, sort_order")
    .eq("id", hero.source_media_asset_id)
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    // A denied policy or a missing column must never blank the banner; the
    // baked hero is the safe answer. Named in dev so the drift is visible.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[banner-source] source lookup failed for hero ${hero.id}: ${error.message}`);
    }
    return hero;
  }
  const source = data as T | null;
  if (!source?.width || !source.storage_path) return hero;
  return source.width >= hero.width * 1.25 ? source : hero;
}
