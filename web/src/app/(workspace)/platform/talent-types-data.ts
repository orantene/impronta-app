/**
 * Platform Talent Types data loader.
 *
 * Loads talent-type taxonomy terms (term_type='talent_type') with analytics
 * derived from agency_talent_roster and talent_profile_taxonomy joins.
 * Service-role only — never import from client components.
 * Degrades to empty shape on any failure.
 */

import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CACHE_TAG_TAXONOMY } from "@/lib/cache-tags";
import { CACHE_TAG_FIELD_CATALOG } from "@/lib/field-engine/cache-tags";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TalentTypeRow = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  plural_name: string | null;
  description: string | null;
  icon: string | null;
  level: number;
  sort_order: number;
  is_active: boolean;
  archived_at: string | null;
  mappedFieldCount: number;
  agencyCount: number;
  talentCount: number;
};

export type TalentTypeRecommendation = {
  id: string;
  field_definition_id: string;
  field_key: string;
  field_label: string;
  field_label_es: string | null;
  field_tier: string;
  relationship: string;
  display_order: number;
  required_at_registration: boolean;
  required_before_publish: boolean;
  required_before_verification: boolean;
  requires_verification: boolean;
  is_admin_only: boolean;
};

export type TalentTypeDetail = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  plural_name: string | null;
  description: string | null;
  icon: string | null;
  level: number;
  sort_order: number;
  is_active: boolean;
  archived_at: string | null;
  is_public_filter: boolean;
  is_profile_badge: boolean;
  is_visible_by_default: boolean;
  is_restricted: boolean;
};

export type TalentTypeDetailResult =
  | {
      ok: true;
      term: TalentTypeDetail;
      recommendations: TalentTypeRecommendation[];
      /** All non-deprecated field definitions for the field mapping panel. */
      fieldOptions: Array<{
        id: string;
        field_key: string;
        label: string;
        tier: string;
        section: string | null;
        deprecated_at: string | null;
      }>;
      agencyCount: number;
      talentCount: number;
      mappedFieldCount: number;
      requiredMappingCount: number;
    }
  | { ok: false; notFound?: boolean };

export type LoadPlatformTalentTypesResult = {
  ok: boolean;
  types: TalentTypeRow[];
};

// ---------------------------------------------------------------------------
// List loader
// ---------------------------------------------------------------------------

const EMPTY_LIST: LoadPlatformTalentTypesResult = { ok: false, types: [] };

export async function loadPlatformTalentTypes(): Promise<LoadPlatformTalentTypesResult> {
  return unstable_cache(
    () => loadPlatformTalentTypesUncached(),
    ["platform:talent-types-list", "v1"],
    {
      tags: [CACHE_TAG_TAXONOMY, CACHE_TAG_FIELD_CATALOG],
      revalidate: 60,
    },
  )();
}

async function loadPlatformTalentTypesUncached(): Promise<LoadPlatformTalentTypesResult> {
  const sb = createServiceRoleClient();
  if (!sb) return EMPTY_LIST;

  try {
    const [termsR, recsR, assignmentsR, rosterR] = await Promise.all([
      sb
        .from("taxonomy_terms")
        .select(
          "id, slug, name_en, name_es, plural_name, description, icon, level, sort_order, is_active, archived_at",
        )
        .eq("term_type", "talent_type")
        .order("sort_order", { ascending: true })
        .order("name_en", { ascending: true }),
      sb
        .from("profile_field_recommendations")
        .select("taxonomy_term_id"),
      sb
        .from("talent_profile_taxonomy")
        .select("taxonomy_term_id, talent_profile_id"),
      sb
        .from("agency_talent_roster")
        .select("talent_profile_id, tenant_id")
        .neq("status", "removed"),
    ]);

    if (termsR.error) {
      // eslint-disable-next-line no-console
      console.error("[talent-types-data] terms load failed:", termsR.error.message);
      return EMPTY_LIST;
    }

    // mappedFieldCount per term
    const mappedCounts = new Map<string, number>();
    for (const row of (recsR.data ?? []) as Array<{ taxonomy_term_id: string | null }>) {
      if (!row.taxonomy_term_id) continue;
      mappedCounts.set(row.taxonomy_term_id, (mappedCounts.get(row.taxonomy_term_id) ?? 0) + 1);
    }

    // talentCount per term — distinct talent_profile_ids per taxonomy_term_id
    const talentsByTerm = new Map<string, Set<string>>();
    for (const row of (assignmentsR.data ?? []) as Array<{
      taxonomy_term_id: string | null;
      talent_profile_id: string | null;
    }>) {
      if (!row.taxonomy_term_id || !row.talent_profile_id) continue;
      const s = talentsByTerm.get(row.taxonomy_term_id) ?? new Set();
      s.add(row.talent_profile_id);
      talentsByTerm.set(row.taxonomy_term_id, s);
    }

    // agencyCount per term — for each talent in term, collect tenant_ids from roster
    // Build: talent_profile_id → Set<tenant_id>
    const tenantsByTalent = new Map<string, Set<string>>();
    for (const row of (rosterR.data ?? []) as Array<{
      talent_profile_id: string | null;
      tenant_id: string | null;
    }>) {
      if (!row.talent_profile_id || !row.tenant_id) continue;
      const s = tenantsByTalent.get(row.talent_profile_id) ?? new Set();
      s.add(row.tenant_id);
      tenantsByTalent.set(row.talent_profile_id, s);
    }

    const types: TalentTypeRow[] = (
      termsR.data as Array<{
        id: string;
        slug: string;
        name_en: string;
        name_es: string | null;
        plural_name: string | null;
        description: string | null;
        icon: string | null;
        level: number;
        sort_order: number;
        is_active: boolean;
        archived_at: string | null;
      }>
    ).map((term) => {
      const talentSet = talentsByTerm.get(term.id) ?? new Set<string>();
      const agencySet = new Set<string>();
      for (const talentId of talentSet) {
        for (const tenantId of (tenantsByTalent.get(talentId) ?? new Set())) {
          agencySet.add(tenantId);
        }
      }
      return {
        id: term.id,
        slug: term.slug,
        name_en: term.name_en,
        name_es: term.name_es,
        plural_name: term.plural_name,
        description: term.description,
        icon: term.icon,
        level: term.level,
        sort_order: term.sort_order ?? 100,
        is_active: term.is_active,
        archived_at: term.archived_at,
        mappedFieldCount: mappedCounts.get(term.id) ?? 0,
        agencyCount: agencySet.size,
        talentCount: talentSet.size,
      };
    });

    return { ok: true, types };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[talent-types-data] unexpected error:", e);
    return EMPTY_LIST;
  }
}

// ---------------------------------------------------------------------------
// Detail loader
// ---------------------------------------------------------------------------

export async function loadPlatformTalentTypeDetail(
  termId: string,
): Promise<TalentTypeDetailResult> {
  return unstable_cache(
    () => loadPlatformTalentTypeDetailUncached(termId),
    ["platform:talent-type-detail", termId, "v1"],
    {
      tags: [CACHE_TAG_TAXONOMY, CACHE_TAG_FIELD_CATALOG],
      revalidate: 60,
    },
  )();
}

async function loadPlatformTalentTypeDetailUncached(
  termId: string,
): Promise<TalentTypeDetailResult> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false };

  try {
    const [termR, recsR, fieldsR, assignmentsR, rosterR] = await Promise.all([
      sb
        .from("taxonomy_terms")
        .select(
          "id, slug, name_en, name_es, plural_name, description, icon, level, sort_order, is_active, archived_at, is_public_filter, is_profile_badge, is_visible_by_default, is_restricted",
        )
        .eq("id", termId)
        .eq("term_type", "talent_type")
        .maybeSingle(),
      sb
        .from("profile_field_recommendations")
        .select(
          "id, field_definition_id, taxonomy_term_id, relationship, display_order, required_at_registration, required_before_publish, required_before_verification, requires_verification, is_admin_only",
        )
        .eq("taxonomy_term_id", termId),
      sb
        .from("profile_field_definitions")
        .select("id, field_key, label, label_es, tier, section, deprecated_at")
        .order("label", { ascending: true }),
      sb
        .from("talent_profile_taxonomy")
        .select("talent_profile_id")
        .eq("taxonomy_term_id", termId),
      sb
        .from("agency_talent_roster")
        .select("talent_profile_id, tenant_id")
        .neq("status", "removed"),
    ]);

    if (termR.error) {
      // eslint-disable-next-line no-console
      console.error("[talent-types-data] detail term load failed:", termR.error.message);
      return { ok: false };
    }
    if (!termR.data) return { ok: false, notFound: true };

    const term = termR.data as TalentTypeDetail;

    // Build recommendations joined to field definitions
    const fieldById = new Map(
      (
        fieldsR.data as Array<{
          id: string;
          field_key: string;
          label: string;
          label_es: string | null;
          tier: string;
          section: string | null;
          deprecated_at: string | null;
        }>
      ).map((f) => [f.id, f] as const),
    );

    const recommendations: TalentTypeRecommendation[] = (
      (recsR.data ?? []) as Array<{
        id: string;
        field_definition_id: string | null;
        taxonomy_term_id: string | null;
        relationship: string | null;
        display_order: number | null;
        required_at_registration: boolean | null;
        required_before_publish: boolean | null;
        required_before_verification: boolean | null;
        requires_verification: boolean | null;
        is_admin_only: boolean | null;
      }>
    )
      .filter((rec) => rec.field_definition_id && fieldById.has(rec.field_definition_id))
      .map((rec) => {
        const field = fieldById.get(rec.field_definition_id!)!;
        return {
          id: rec.id,
          field_definition_id: rec.field_definition_id!,
          field_key: field.field_key,
          field_label: field.label,
          field_label_es: field.label_es,
          field_tier: field.tier,
          relationship: rec.relationship ?? "applies",
          display_order: rec.display_order ?? 100,
          required_at_registration: !!rec.required_at_registration,
          required_before_publish: !!rec.required_before_publish,
          required_before_verification: !!rec.required_before_verification,
          requires_verification: !!rec.requires_verification,
          is_admin_only: !!rec.is_admin_only,
        };
      })
      .sort(
        (a, b) => a.display_order - b.display_order || a.field_label.localeCompare(b.field_label),
      );

    const fieldOptions = (
      fieldsR.data as Array<{
        id: string;
        field_key: string;
        label: string;
        label_es: string | null;
        tier: string;
        section: string | null;
        deprecated_at: string | null;
      }>
    )
      .map((f) => ({
        id: f.id,
        field_key: f.field_key,
        label: f.label,
        tier: f.tier,
        section: f.section,
        deprecated_at: f.deprecated_at,
      }))
      .sort((a, b) => a.label.localeCompare(b.label) || a.field_key.localeCompare(b.field_key));

    // Analytics
    const talentProfileIds = new Set(
      ((assignmentsR.data ?? []) as Array<{ talent_profile_id: string | null }>)
        .filter((r) => r.talent_profile_id)
        .map((r) => r.talent_profile_id!),
    );

    const agencySet = new Set<string>();
    for (const row of (rosterR.data ?? []) as Array<{
      talent_profile_id: string | null;
      tenant_id: string | null;
    }>) {
      if (row.tenant_id && row.talent_profile_id && talentProfileIds.has(row.talent_profile_id)) {
        agencySet.add(row.tenant_id);
      }
    }

    return {
      ok: true,
      term,
      recommendations,
      fieldOptions,
      agencyCount: agencySet.size,
      talentCount: talentProfileIds.size,
      mappedFieldCount: recommendations.length,
      requiredMappingCount: recommendations.filter(
        (r) => r.relationship === "required" || r.required_before_publish,
      ).length,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[talent-types-data] detail unexpected error:", e);
    return { ok: false };
  }
}
