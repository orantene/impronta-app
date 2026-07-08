import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A talent's face + one-line basic info for any surface that LISTS talent
 * (lineup, offer line items, participant chips, approval cards). The product
 * rule: wherever a talent appears we show a real photo + a discipline, never
 * an initials-in-a-box — it reads "unfinished" and erodes confidence.
 */
export type TalentChipInfo = {
  /** Public URL of the talent's directory 'card' crop, or null (→ initials). */
  photoUrl: string | null;
  /** The talent's PRIMARY discipline (e.g. "Editorial Model"), or null. */
  headline: string | null;
  /**
   * Verified global standing: mean of PUBLISHED reviews
   * (`talent_profiles.rating_avg`), or null when there are none. Paired with
   * `ratingCount` so a caller can render a compact "★ 4.9 · 12" trust chip and
   * render nothing when the count is 0 (absence is neutral).
   */
  ratingAvg: number | null;
  /** Count of PUBLISHED reviews (`talent_profiles.rating_count`), or null. */
  ratingCount: number | null;
};

/**
 * Resolve `{ photoUrl, headline }` for a set of talents, keyed by
 * `talent_profile_id`. Photo = first approved, non-deleted `variant_kind='card'`
 * media asset (same crop the public directory uses); headline = the primary
 * `talent_profile_taxonomy` term. Best-effort: any miss → nulls, so the caller's
 * Avatar simply falls back to initials. Lives in a `server-only` lib so the raw
 * `media_assets` / taxonomy reads stay out of the `use server` action files (the
 * no-untenanted-from ratchet) — those tables key on owner_talent_profile_id, not
 * tenant_id, and the caller already scopes the talent id set.
 */
export async function loadTalentChipInfo(
  supabase: SupabaseClient,
  talentProfileIds: Array<string | null | undefined>,
): Promise<Map<string, TalentChipInfo>> {
  const out = new Map<string, TalentChipInfo>();
  const ids = Array.from(
    new Set(talentProfileIds.filter((x): x is string => typeof x === "string" && x.length > 0)),
  );
  if (ids.length === 0) return out;
  for (const id of ids) out.set(id, { photoUrl: null, headline: null, ratingAvg: null, ratingCount: null });

  // Photo — first approved, non-deleted 'card' crop per talent.
  try {
    const { data: media } = await supabase
      .from("media_assets")
      .select("owner_talent_profile_id, bucket_id, storage_path, sort_order")
      .in("owner_talent_profile_id", ids)
      .eq("variant_kind", "card")
      .eq("approval_state", "approved")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });
    for (const m of media ?? []) {
      const owner = (m as { owner_talent_profile_id: string }).owner_talent_profile_id;
      const cur = out.get(owner);
      if (!cur || cur.photoUrl) continue; // first (lowest sort_order) wins
      const bucket = (m as { bucket_id: string | null }).bucket_id;
      const path = (m as { storage_path: string | null }).storage_path;
      if (!bucket || !path) continue;
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      if (pub?.publicUrl) cur.photoUrl = pub.publicUrl;
    }
  } catch {
    // best-effort — leave photoUrl null
  }

  // Headline — the talent's PRIMARY discipline taxonomy term.
  try {
    const { data: tax } = await supabase
      .from("talent_profile_taxonomy")
      .select("talent_profile_id, taxonomy_terms ( name_i18n )")
      .in("talent_profile_id", ids)
      .eq("is_primary", true);
    for (const t of tax ?? []) {
      const row = t as unknown as {
        talent_profile_id: string;
        taxonomy_terms:
          | { name_i18n: Record<string, string | null> | null }
          | { name_i18n: Record<string, string | null> | null }[]
          | null;
      };
      const tt = row.taxonomy_terms;
      const term = Array.isArray(tt) ? (tt[0]?.name_i18n?.en ?? null) : (tt?.name_i18n?.en ?? null);
      const cur = out.get(row.talent_profile_id);
      if (cur && term && !cur.headline) cur.headline = term;
    }
  } catch {
    // best-effort — leave headline null
  }

  // Verified standing — one batched read of the denormalized aggregate on
  // talent_profiles (recomputed from PUBLISHED reviews). rating_count === 0 is
  // the default for a talent with no published reviews, so the caller treats
  // 0 as "no rating" and renders nothing (absence is neutral).
  try {
    const { data: standing } = await supabase
      .from("talent_profiles")
      .select("id, rating_avg, rating_count")
      .in("id", ids);
    for (const s of standing ?? []) {
      const row = s as { id: string; rating_avg: number | null; rating_count: number | null };
      const cur = out.get(row.id);
      if (!cur) continue;
      const count = typeof row.rating_count === "number" ? row.rating_count : 0;
      if (count > 0) {
        cur.ratingCount = count;
        cur.ratingAvg = typeof row.rating_avg === "number" ? row.rating_avg : null;
      }
    }
  } catch {
    // best-effort — leave rating null
  }

  return out;
}
