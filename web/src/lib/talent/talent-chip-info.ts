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
  for (const id of ids) out.set(id, { photoUrl: null, headline: null });

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
      .select("talent_profile_id, taxonomy_terms ( name_en )")
      .in("talent_profile_id", ids)
      .eq("is_primary", true);
    for (const t of tax ?? []) {
      const row = t as unknown as {
        talent_profile_id: string;
        taxonomy_terms:
          | { name_en: string | null }
          | { name_en: string | null }[]
          | null;
      };
      const tt = row.taxonomy_terms;
      const term = Array.isArray(tt) ? (tt[0]?.name_en ?? null) : (tt?.name_en ?? null);
      const cur = out.get(row.talent_profile_id);
      if (cur && term && !cur.headline) cur.headline = term;
    }
  } catch {
    // best-effort — leave headline null
  }

  return out;
}
