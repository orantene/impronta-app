import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { readBlobFieldValuesFromCatalog } from "@/lib/talent/blob-field-values-catalog";
import { effectiveBioI18n } from "@/lib/translation/bios-to-bio-i18n";
import {
  buildTalentLocaleSwaps,
  type LocalizedMapLike,
} from "../talent-locale-swaps";
import { loadHeroProofData } from "./load-hero-proof";

type Row = {
  bio_i18n: LocalizedMapLike;
  talent_profile_taxonomy:
    | Array<{
        is_primary: boolean | null;
        display_order: number | null;
        taxonomy_terms: { kind: string | null; name_i18n: LocalizedMapLike } | null;
      }>
    | null;
  talent_service_areas:
    | Array<{ service_kind: string | null; locations: { display_name_i18n: LocalizedMapLike } | null }>
    | null;
};

/** Render-time swap map for one talent + locale. `{}` on any failure. */
export async function loadTalentLocaleSwaps(
  talentProfileId: string,
  locale: string | null | undefined,
  chain: readonly string[] = [],
): Promise<Record<string, string>> {
  const admin = createServiceRoleClient();
  if (!admin) return {};
  try {
    const { data, error } = await admin
      .from("talent_profiles")
      .select(`
        bio_i18n,
        talent_profile_taxonomy ( is_primary, display_order, taxonomy_terms ( kind, name_i18n ) ),
        talent_service_areas ( service_kind, locations ( display_name_i18n ) )
      `)
      .eq("id", talentProfileId)
      .maybeSingle();
    if (error || !data) {
      if (error) logServerError("talentSite.localeSwaps", error);
      return {};
    }
    const row = data as unknown as Row;
    const types = (row.talent_profile_taxonomy ?? [])
      .filter((t) => t.taxonomy_terms?.kind === "talent_type")
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || (a.display_order ?? 0) - (b.display_order ?? 0))
      .map((t) => t.taxonomy_terms?.name_i18n ?? null);
    const home = (row.talent_service_areas ?? []).find((a) => a.service_kind === "home_base");
    // F25: the drawer's saved `bios` fill locales bio_i18n lacks (same read as the site).
    const bios = (await readBlobFieldValuesFromCatalog(admin, talentProfileId)).bios;
    // The hero proof line only needs a Spanish form; other locales skip the extra reads.
    const spanish = (locale ?? "").trim().toLowerCase().startsWith("es");
    const proof = spanish ? await loadProofInput(admin, talentProfileId) : undefined;
    return buildTalentLocaleSwaps(
      {
        bioI18n: effectiveBioI18n(row.bio_i18n, bios),
        typeNames: types,
        homeCity: home?.locations?.display_name_i18n ?? null,
        ...(proof ? { proof } : {}),
      },
      locale,
      chain,
    );
  } catch (err) {
    logServerError("talentSite.localeSwaps", err);
    return {};
  }
}

/** The same facts the token projection used, so the swap key equals the baked English line. */
async function loadProofInput(admin: NonNullable<ReturnType<typeof createServiceRoleClient>>, talentProfileId: string) {
  const { data: langs } = await admin
    .from("talent_languages")
    .select("language_name, display_order")
    .eq("talent_profile_id", talentProfileId)
    .order("display_order", { ascending: true })
    .order("language_name", { ascending: true });
  const data = await loadHeroProofData(admin, talentProfileId);
  return {
    years: data.years,
    rating: data.rating,
    count: data.count,
    demo: data.demo,
    languages: (langs ?? [])
      .map((r) => (r as { language_name: string | null }).language_name?.trim())
      .filter((n): n is string => !!n),
  };
}
