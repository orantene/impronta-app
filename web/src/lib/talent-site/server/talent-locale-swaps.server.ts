import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { readBlobFieldValuesFromCatalog } from "@/lib/talent/blob-field-values-catalog";
import { effectiveBioI18n } from "@/lib/translation/bios-to-bio-i18n";
import {
  buildTalentLocaleSwaps,
  type LocalizedMapLike,
} from "../talent-locale-swaps";

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
    return buildTalentLocaleSwaps(
      { bioI18n: effectiveBioI18n(row.bio_i18n, bios), typeNames: types, homeCity: home?.locations?.display_name_i18n ?? null },
      locale,
      chain,
    );
  } catch (err) {
    logServerError("talentSite.localeSwaps", err);
    return {};
  }
}
