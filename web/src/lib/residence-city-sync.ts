import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve a free-text home city ("Tulum", "playa del carmen") against the
 * canonical `locations` catalog and return the structured residence patch
 * for `talent_profiles` when it matches EXACTLY ONE active city.
 *
 * Why: several admin surfaces save only `home_city_text`, but the public
 * directory (cards, map pins, city filter) reads the STRUCTURED
 * `residence_city_id` join — so a text-only edit left the talent pinned to
 * their old city. Ambiguous or unknown text resolves to `{}` (no change):
 * we never guess, and the canonical location pickers keep working as the
 * precise path.
 */
export async function residenceCityPatchFromText(
  supabase: SupabaseClient,
  cityText: string | null | undefined,
): Promise<Record<string, unknown>> {
  const q = cityText?.trim();
  if (!q) return {};
  const slug = q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // PostgREST `.or()` uses `,` and `()` as syntax — a q containing them
  // can't be safely embedded, so those fall back to the slug match only.
  const textSafe = !/[,()]/.test(q);
  const orExpr = textSafe
    ? `city_slug.eq.${slug},display_name_i18n->>en.ilike.${q},display_name_i18n->>es.ilike.${q}`
    : `city_slug.eq.${slug}`;
  const { data, error } = await supabase
    // eslint-disable-next-line ratchet/no-untenanted-from -- `locations` is the GLOBAL city catalog (no tenant column); read-only match by name/slug
    .from("locations")
    .select("id, country_id, city_slug, display_name_i18n")
    .eq("active", true)
    .is("archived_at", null)
    .or(orExpr)
    .limit(2);
  if (error || !data || data.length !== 1) return {};
  const city = data[0] as { id: string; country_id: string | null };
  return {
    residence_city_id: city.id,
    location_id: city.id,
    ...(city.country_id ? { residence_country_id: city.country_id } : {}),
  };
}
