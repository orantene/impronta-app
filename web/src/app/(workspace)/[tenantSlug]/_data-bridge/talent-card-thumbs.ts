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
 * Storage path → renderable URL.
 *
 * Some rows store an already-absolute URL (e.g. seeded i.pravatar.cc avatars)
 * or a root-relative `public/` asset path (free-starter demo portraits —
 * host-agnostic, zero storage egress). Pass those through untouched:
 * getPublicUrl() would otherwise prepend the bucket path and mangle them.
 * (discover.ts's old inline copy had this guard; centralized here so every
 * surface — including the phase-2 per-hub resolver — resolves them the same.)
 */
export function mediaPublicUrl(client: SupabaseClient, storagePath: string): string {
  return storagePath.startsWith("http") || storagePath.startsWith("/")
    ? storagePath
    : client.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/** One ranked face candidate. `id` is what phase 3's two-key filter needs. */
export type TalentThumbCandidate = {
  id: string;
  owner_talent_profile_id: string;
  storage_path: string;
  variant_kind: string;
};

/**
 * The raw ranked candidates behind `loadTalentCardThumbs`, WITH asset ids.
 *
 * Phase 3 needs the ids: the two-key rule filters candidates before the rank
 * picks a winner, so a photo the talent may not use on this hub falls through
 * to the next-best variant instead of blanking the card. Kept here rather than
 * in the resolver so there is still exactly one place that knows the rank.
 */
export async function loadTalentCardThumbCandidates(
  client: SupabaseClient,
  talentProfileIds: (string | null | undefined)[],
): Promise<TalentThumbCandidate[]> {
  const ids = [...new Set(talentProfileIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return [];

  const { data } = await client
    .from("media_assets")
    .select("id, owner_talent_profile_id, storage_path, variant_kind")
    .in("owner_talent_profile_id", ids)
    .in("variant_kind", FACE_VARIANTS)
    .is("deleted_at", null);

  return (data ?? []) as unknown as TalentThumbCandidate[];
}

/** Rank-reduce candidates to one URL per talent. Pure; shared by both paths. */
export function pickBestThumbs(
  client: SupabaseClient,
  candidates: readonly TalentThumbCandidate[],
): Map<string, string> {
  const out = new Map<string, string>();
  const bestRank = new Map<string, number>();
  for (const m of candidates) {
    const rank = THUMB_RANK[m.variant_kind] ?? 99;
    if (rank < (bestRank.get(m.owner_talent_profile_id) ?? 99)) {
      out.set(m.owner_talent_profile_id, mediaPublicUrl(client, m.storage_path));
      bestRank.set(m.owner_talent_profile_id, rank);
    }
  }
  return out;
}

/**
 * Returns a Map keyed by talent_profile_id → public thumbnail URL. Empty map
 * on no input or error (callers fall back to initials). Never throws.
 */
export async function loadTalentCardThumbs(
  client: SupabaseClient,
  talentProfileIds: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(talentProfileIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return new Map();
  return pickBestThumbs(client, await loadTalentCardThumbCandidates(client, ids));
}
