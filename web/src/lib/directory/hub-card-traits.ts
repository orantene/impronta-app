import "server-only";

import { buildCardAttributesForProfile } from "@/lib/directory/build-card-attributes-for-profile";
import { getCachedDirectoryCardDisplayCatalog } from "@/lib/directory/directory-card-display-catalog";
import type {
  FieldValueRow,
  ProfileTaxonomyTerm,
} from "@/lib/directory/format-card-attribute-value";
import type { DirectoryLocale } from "@/lib/directory/talent-card-dto";
import { fetchDirectoryCardValues } from "@/lib/field-engine/read-source-directory-card-values";
import type {
  DirectoryCardAttribute,
  DirectoryCardFitLabel,
} from "@/lib/site-admin/sections/directory/card-data";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

export type HubCardTraits = {
  fitLabels: DirectoryCardFitLabel[];
  cardAttributes: DirectoryCardAttribute[];
};

/**
 * Fit chips + engine attributes for the platform hub directory
 * (tulala.digital/directory). The cross-tenant `talent_discover_index`
 * carries no field data, so the marketing grid rendered every card without
 * a single trait. This projects the SAME rows the tenant directory builds
 * (`buildCardAttributesForProfile`, the `directory_card_values` reader), but
 * scoped to the HUB workspace's card catalog — the hub's Card Design admin
 * already owns this grid's look, so it owns which fields show too.
 *
 * Batched: one values read + one taxonomy read + one height read for the
 * whole page. Degrade-safe: any failure returns an empty map and the cards
 * simply render without traits, exactly as before.
 */
export async function loadHubCardTraits(
  hubTenantId: string | null,
  profileIds: readonly string[],
  locale: DirectoryLocale,
): Promise<Map<string, HubCardTraits>> {
  const out = new Map<string, HubCardTraits>();
  if (profileIds.length === 0) return out;

  try {
    const supabase = createServiceRoleClient() ?? createPublicSupabaseClient();
    if (!supabase) return out;
    const { fitLabelsEnabled, heightCardDef, scalarCardDefs } =
      await getCachedDirectoryCardDisplayCatalog({ tenantId: hubTenantId });

    const [valuesByProfileId, taxonomyRes, heightRes] = await Promise.all([
      scalarCardDefs.length > 0
        ? fetchDirectoryCardValues(supabase, scalarCardDefs, profileIds)
        : Promise.resolve(new Map<string, Map<string, FieldValueRow>>()),
      supabase
        .from("talent_profile_taxonomy")
        .select("talent_profile_id, taxonomy_terms ( id, kind, slug, name_i18n, sort_order )")
        .in("talent_profile_id", profileIds),
      heightCardDef
        ? supabase.from("talent_profiles").select("id, height_cm").in("id", profileIds)
        : Promise.resolve({ data: [] as { id: string; height_cm: number | null }[], error: null }),
    ]);
    if (taxonomyRes.error) throw new Error(taxonomyRes.error.message);
    if (heightRes.error) throw new Error(heightRes.error.message);

    type TermRow = {
      id: string;
      kind: string;
      slug: string;
      name_i18n: Record<string, string | null> | null;
      sort_order: number;
    };
    const termsByProfile = new Map<string, TermRow[]>();
    for (const row of (taxonomyRes.data ?? []) as {
      talent_profile_id: string;
      taxonomy_terms: TermRow | TermRow[] | null;
    }[]) {
      const terms = row.taxonomy_terms
        ? Array.isArray(row.taxonomy_terms)
          ? row.taxonomy_terms
          : [row.taxonomy_terms]
        : [];
      const list = termsByProfile.get(row.talent_profile_id) ?? [];
      list.push(...terms);
      termsByProfile.set(row.talent_profile_id, list);
    }
    const heightByProfile = new Map<string, number | null>();
    for (const row of (heightRes.data ?? []) as { id: string; height_cm: number | null }[]) {
      heightByProfile.set(row.id, row.height_cm);
    }
    // Legacy `value_taxonomy_ids` on card values are empty in practice (see
    // fetch-directory-page.ts); no term-name lookup needed for this surface.
    const termsById = new Map<string, { name_en: string; name_es: string | null }>();
    const pick = (en: string, es: string | null) =>
      locale === "es" && es ? es : en;

    for (const id of profileIds) {
      const terms = termsByProfile.get(id) ?? [];
      const profileTaxonomyTerms: ProfileTaxonomyTerm[] = terms.map((t) => ({
        kind: t.kind,
        name_en: t.name_i18n?.en ?? "",
        name_es: t.name_i18n?.es ?? null,
        sort_order: t.sort_order,
      }));
      const fitLabels: DirectoryCardFitLabel[] = fitLabelsEnabled
        ? terms
            .filter((t) => t.kind === "fit_label")
            .sort((a, b) => a.sort_order - b.sort_order)
            .slice(0, 2)
            .map((t) => ({ slug: t.slug, label: pick(t.name_i18n?.en ?? "", t.name_i18n?.es ?? null) }))
            .filter((f) => f.label.length > 0)
        : [];
      const attrs = buildCardAttributesForProfile(
        { id, height_cm: heightByProfile.get(id) ?? null },
        locale,
        heightCardDef,
        scalarCardDefs,
        valuesByProfileId.get(id) ?? new Map<string, FieldValueRow>(),
        termsById,
        profileTaxonomyTerms,
      );
      const cardAttributes: DirectoryCardAttribute[] = attrs
        .map((a) => ({ key: a.key, label: pick(a.label_en, a.label_es), value: a.value }))
        .filter((a) => a.label.length > 0 && a.value.length > 0);
      if (fitLabels.length > 0 || cardAttributes.length > 0) {
        out.set(id, { fitLabels, cardAttributes });
      }
    }
  } catch (err) {
    // Degrade-safe by design (cards render trait-less); surfaced in logs only.
    // eslint-disable-next-line no-console
    console.error("[hub-directory] card traits unavailable:", err);
  }
  return out;
}
