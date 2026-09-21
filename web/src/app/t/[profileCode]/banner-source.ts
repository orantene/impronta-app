/**
 * resolveSharperBanner — swap a small, hand-cropped `hero` asset for its
 * full-resolution source, but ONLY when that source's framing is still
 * banner-appropriate.
 *
 * Until 2026-09-20 the upload pipeline capped `hero` masters at 1400px (the
 * cap was sized for a 4:5 cover card), while the profile templates paint the
 * hero full-bleed across the viewport. Every hero stored before the cap was
 * raised is 900–1400px wide and reads as low quality on a Retina screen.
 * Heroes are crops of a gallery asset (`source_media_asset_id`) — but the
 * crop tool never stored the crop rectangle, only the source id, so the
 * source cannot be re-cropped to match; it can only be swapped in whole.
 *
 * INCIDENT 2026-09-21: the first version of this function swapped in ANY
 * sufficiently-wide source, including tall portrait fashion shots (e.g.
 * 1596x2400, ratio 0.66). `object-fit: cover` on a full-bleed banner scales
 * that to banner WIDTH, which makes it far taller than the viewport, so
 * `object-position` only shows a thin horizontal sliver near the top —
 * Anto's live banner cropped to hairline and headphones, face gone. Higher
 * resolution, worse photo. Fixed by also requiring the source's aspect
 * ratio not be meaningfully more portrait than the baked hero crop's own
 * ratio — a source that fails this check is a real, sharper photo of the
 * same person that simply cannot serve as this banner without its own crop
 * coordinates, which the pipeline does not have.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const SHARP_HERO_MIN_WIDTH = 1600;

/** How much more portrait than the hero's own ratio a source may be before it is rejected. */
const ASPECT_TOLERANCE = 0.75;

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
  if (!source?.width || !source?.height || !source.storage_path) return hero;
  if (source.width < hero.width * 1.25) return hero;

  // Aspect-ratio guard: reject a source that is meaningfully more portrait
  // than the hero's own baked crop — it cannot be reframed to a banner
  // without the original crop rectangle, which is not stored.
  const heroRatio = hero.width / (hero.height || hero.width);
  const sourceRatio = source.width / source.height;
  if (sourceRatio < heroRatio * ASPECT_TOLERANCE) return hero;

  return source;
}
