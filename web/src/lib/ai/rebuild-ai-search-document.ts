/**
 * Loads profile + taxonomy + ai_visible field values and persists `talent_profiles.ai_search_document`.
 * Call after profile, taxonomy, or field value mutations affecting public search semantics.
 *
 * v2 (engine-driven): the rebuild now loads talent_languages, talent_service_areas,
 * walks the primary role's parent_category lineage, and splits taxonomy
 * assignments by relationship_type into secondaryRoles / skills / contexts /
 * credentials so the embedding has the rich v2 structure. Legacy
 * taxonomyTerms[] is still passed as a fallback for any kind that doesn't
 * have a v2 home (e.g. fit_label).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAiSearchDocument,
  type AiSearchDocumentTaxonomyTerm,
  type AiSearchDocumentLanguage,
  type AiSearchDocumentServiceArea,
} from "@/lib/ai/build-ai-search-document";
import { logServerError } from "@/lib/server/safe-error";
import {
  extractPrimaryRoleRow,
  extractSecondaryRoleTerms,
  extractTermsByRelationship,
  fetchLineageByTermId,
  type ProfileTaxonomyRow,
  type TermShape,
} from "@/lib/taxonomy/engine";
import { readAiSearchDocFields } from "@/lib/field-engine/read-source-ai-search-doc";

export async function rebuildAiSearchDocument(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<{ document: string | null; error?: string }> {
  try {
    const { data: profile, error: pErr } = await supabase
      .from("talent_profiles")
      .select("id, display_name, first_name, last_name, short_bio, bio_i18n, height_cm, gender, residence_city_id")
      .eq("id", talentProfileId)
      .maybeSingle();

    if (pErr) {
      logServerError("rebuildAiSearchDocument/profile", pErr);
      return { document: null, error: pErr.message };
    }
    if (!profile) {
      return { document: null, error: "Profile not found" };
    }

    const p = profile as Record<string, unknown>;
    let locationLabel: string | null = null;
    const rid = p.residence_city_id as string | null | undefined;
    if (rid) {
      const { data: loc } = await supabase
        .from("locations")
        .select("display_name_i18n")
        .eq("id", rid)
        .maybeSingle();
      if (loc) {
        const i18n = (loc as { display_name_i18n?: Record<string, string | null> | null }).display_name_i18n ?? {};
        locationLabel =
          i18n.en?.trim() || (typeof i18n.es === "string" ? i18n.es.trim() : "") || null;
      }
    }

    // Single fetch — taxonomy assignments + the joined term row, including
    // v2 columns (term_type, parent_id, search_synonyms, ai_keywords) so the
    // engine can do everything in one pass.
    const { data: taxRowsRaw, error: taxErr } = await supabase
      .from("talent_profile_taxonomy")
      .select(
        `
        taxonomy_term_id,
        is_primary,
        relationship_type,
        taxonomy_terms (
          id,
          kind,
          term_type,
          parent_id,
          slug,
          name_i18n,
          search_synonyms,
          ai_keywords
        )
      `,
      )
      .eq("talent_profile_id", talentProfileId);

    if (taxErr) {
      logServerError("rebuildAiSearchDocument/taxonomy", taxErr);
    }

    const taxRows = (taxRowsRaw ?? []) as unknown as ProfileTaxonomyRow[];

    // Engine-driven extraction of primary + secondary + skill + context +
    // credential + attribute relationships. Legacy rows fall through.
    const primaryRow = extractPrimaryRoleRow(taxRows);
    const primaryTerm = primaryRow
      ? (Array.isArray(primaryRow.taxonomy_terms)
          ? primaryRow.taxonomy_terms[0]
          : primaryRow.taxonomy_terms) ?? null
      : null;
    // name_en folded into name_i18n {en,es} (WS4); resolve the English value.
    const primaryTermNameEn = primaryTerm?.name_i18n?.en ?? primaryTerm?.name_en ?? null;
    const primaryTalentTypeLabel: string | null = primaryTerm
      ? primaryTermNameEn?.trim() || primaryTerm.slug || null
      : null;

    const secondaryRoles: string[] = extractSecondaryRoleTerms(taxRows)
      .map((t) => t.name_en?.trim())
      .filter((s): s is string => Boolean(s));

    const skills: string[] = extractTermsByRelationship(taxRows, "skill")
      .map((t) => t.name_en?.trim())
      .filter((s): s is string => Boolean(s));

    const contexts: string[] = extractTermsByRelationship(taxRows, "context")
      .map((t) => t.name_en?.trim())
      .filter((s): s is string => Boolean(s));

    const credentialsAndAttributes: string[] = [
      ...extractTermsByRelationship(taxRows, "credential"),
      ...extractTermsByRelationship(taxRows, "attribute"),
    ]
      .map((t) => t.name_en?.trim())
      .filter((s): s is string => Boolean(s));

    // Walk parent_id chain for the primary role to build the lineage path.
    let primaryTalentTypeLineage: string[] = [];
    let searchSynonyms: string[] = [];
    if (primaryTerm?.id) {
      const lineage: TermShape[] = await fetchLineageByTermId(supabase, primaryTerm.id);
      primaryTalentTypeLineage = lineage
        .map((t) => t.name_en?.trim())
        .filter((s): s is string => Boolean(s));
      // Collect curated synonyms from the primary term's row itself
      // (already loaded in taxRows so no extra fetch).
      const synonyms = (primaryTerm as { search_synonyms?: string[] | null; ai_keywords?: string[] | null });
      searchSynonyms = [
        ...(synonyms.search_synonyms ?? []),
        ...(synonyms.ai_keywords ?? []),
      ];
    }

    // Legacy taxonomyTerms[] fallback — fit_labels still surface here, plus
    // any term that doesn't have a v2 home. The builder skips kinds that are
    // already represented via v2 inputs (skill / language / event_type when
    // structuredLanguages / skills / contexts are populated).
    const taxonomyTerms: AiSearchDocumentTaxonomyTerm[] = [];
    for (const row of taxRows) {
      const t = Array.isArray(row.taxonomy_terms) ? row.taxonomy_terms[0] : row.taxonomy_terms;
      if (!t?.kind) continue;
      taxonomyTerms.push({
        kind: t.kind,
        slug: t.slug ?? null,
        name_en: t.name_i18n?.en ?? t.name_en ?? "",
        name_es: t.name_i18n?.es ?? t.name_es ?? null,
      });
    }

    // Structured languages from the canonical table.
    const { data: langRows } = await supabase
      .from("talent_languages")
      .select(
        "language_code, language_name, speaking_level, is_native, can_host, can_sell, can_translate, can_teach, display_order",
      )
      .eq("talent_profile_id", talentProfileId)
      .order("display_order", { ascending: true });

    const structuredLanguages: AiSearchDocumentLanguage[] = (langRows ?? []).map((r) => ({
      language_code: (r as { language_code: string }).language_code,
      language_name: (r as { language_name: string }).language_name,
      speaking_level: (r as { speaking_level: AiSearchDocumentLanguage["speaking_level"] }).speaking_level,
      is_native: !!(r as { is_native?: boolean }).is_native,
      can_host: !!(r as { can_host?: boolean }).can_host,
      can_sell: !!(r as { can_sell?: boolean }).can_sell,
      can_translate: !!(r as { can_translate?: boolean }).can_translate,
      can_teach: !!(r as { can_teach?: boolean }).can_teach,
    }));

    // Structured service areas with city + country.
    const { data: areaRows } = await supabase
      .from("talent_service_areas")
      .select(
        `
        service_kind,
        travel_radius_km,
        display_order,
        locations ( display_name_i18n, country_code )
      `,
      )
      .eq("talent_profile_id", talentProfileId)
      .order("display_order", { ascending: true });

    const serviceAreas: AiSearchDocumentServiceArea[] = (areaRows ?? []).flatMap((r) => {
      const row = r as {
        service_kind: AiSearchDocumentServiceArea["service_kind"];
        travel_radius_km: number | null;
        locations:
          | { display_name_i18n?: Record<string, string | null> | null; country_code?: string | null }
          | { display_name_i18n?: Record<string, string | null> | null; country_code?: string | null }[]
          | null;
      };
      const loc = Array.isArray(row.locations) ? row.locations[0] : row.locations;
      const cityName = loc?.display_name_i18n?.en?.trim();
      if (!cityName) return [];
      return [{
        service_kind: row.service_kind,
        city_name: cityName,
        country_code: loc?.country_code ?? null,
        travel_radius_km: row.travel_radius_km,
      }];
    });

    // Load AI-visible field lines + gender gate via the field-engine read seam
    // (T2.5). The flag `ai_search_doc` decides A (legacy field_values) or B
    // (canonical talent_profile_field_values); defaults to B as of T2.5.
    // A B-read that throws safe-falls-back to A — the doc is never silently empty.
    let aiVisibleFields: import("@/lib/ai/build-ai-search-document").AiSearchDocumentFieldLine[] = [];
    let genderAiVisible = false;
    try {
      const result = await readAiSearchDocFields(supabase, talentProfileId);
      aiVisibleFields = result.aiVisibleFields;
      genderAiVisible = result.genderAiVisible;
    } catch (fieldErr) {
      logServerError("rebuildAiSearchDocument/field_values", fieldErr);
    }

    const genderForDoc =
      genderAiVisible && typeof p.gender === "string" && p.gender.trim() ? p.gender.trim() : null;

    const document = buildAiSearchDocument({
      displayName: (p.display_name as string | null) ?? null,
      firstName: (p.first_name as string | null) ?? null,
      lastName: (p.last_name as string | null) ?? null,
      primaryTalentTypeLabel,
      primaryTalentTypeLineage,
      secondaryRoles,
      locationLabel,
      serviceAreas,
      heightCm: (p.height_cm as number | null) ?? null,
      gender: genderForDoc,
      shortBio: (p.short_bio as string | null) ?? null,
      bioEn: ((p.bio_i18n as Record<string, string> | null)?.en as string | null) ?? null,
      bioEs: ((p.bio_i18n as Record<string, string> | null)?.es as string | null) ?? null,
      taxonomyTerms,
      structuredLanguages,
      skills,
      contexts,
      credentialsAndAttributes,
      searchSynonyms,
      aiVisibleFields,
    });

    const { error: upErr } = await supabase
      .from("talent_profiles")
      .update({
        ai_search_document: document || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", talentProfileId);

    if (upErr) {
      logServerError("rebuildAiSearchDocument/update", upErr);
      return { document: null, error: upErr.message };
    }

    return { document };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logServerError("rebuildAiSearchDocument", e);
    return { document: null, error: msg };
  }
}
