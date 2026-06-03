import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * _data-bridge/talent-card-thumbs.ts — batch-resolve a public card-thumbnail
 * URL per talent from media_assets.
 *
 * The roster, discover, and (now) client-inquiry surfaces all need the SAME
 * face for a talent. This centralizes the variant-rank fallback so every
 * surface shows the same image and a card never goes blank just because a
 * talent saved only a gallery/portfolio shot. Caller passes a service-role
 * client when it must read assets across tenants (the client-facing lineup
 * and the cross-agency inbox both do).
 */

const BUCKET = "media-public";

// Prefer the dedicated card crop, then fall back through face-appropriate
// public display variants so a card never goes blank just because a talent
// only saved a hero/gallery shot. All keys are real `media_variant_kind` enum
// values (verified against prod — `card` 28 talents, `gallery` 24, `hero` 6);
// the filter list below is derived from these keys so they can't drift.
// (Note: roster.ts's older copy of this list included a non-existent
// `portfolio` variant and omitted `hero` — both fixed here.)
const THUMB_RANK: Record<string, number> = {
  card: 0,
  hero: 1,
  public_watermarked: 2,
  gallery: 3,
  original: 4,
};
const FACE_VARIANTS = Object.keys(THUMB_RANK);

/**
 * Returns a Map keyed by talent_profile_id → public thumbnail URL. Empty map
 * on no input or error (callers fall back to initials). Never throws.
 */
export async function loadTalentCardThumbs(
  client: SupabaseClient,
  talentProfileIds: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(talentProfileIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return out;

  const { data } = await client
    .from("media_assets")
    .select("owner_talent_profile_id, storage_path, variant_kind")
    .in("owner_talent_profile_id", ids)
    .in("variant_kind", FACE_VARIANTS)
    .is("deleted_at", null);

  const bestRank = new Map<string, number>();
  for (const m of (data ?? []) as Array<{
    owner_talent_profile_id: string;
    storage_path: string;
    variant_kind: string;
  }>) {
    const rank = THUMB_RANK[m.variant_kind] ?? 99;
    if (rank < (bestRank.get(m.owner_talent_profile_id) ?? 99)) {
      // Some rows store an already-absolute URL (e.g. seeded i.pravatar.cc
      // avatars). Pass those through untouched — getPublicUrl() would otherwise
      // prepend the bucket path and mangle them. (discover.ts's old inline copy
      // had this guard; preserved here so every surface resolves them.)
      const url = m.storage_path.startsWith("http")
        ? m.storage_path
        : client.storage.from(BUCKET).getPublicUrl(m.storage_path).data.publicUrl;
      out.set(m.owner_talent_profile_id, url);
      bestRank.set(m.owner_talent_profile_id, rank);
    }
  }
  return out;
}
