// Phase 3.12 / Roster — extended talent edit data loaders.
//
// Server-only. Loads everything the talent edit page renders that goes
// beyond the core profile fields: multi-role taxonomy (primary_role +
// secondary_role + skills + attributes + contexts), languages, service
// areas, portfolio gallery photos.

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaxonomyTermPick = {
  id: string;
  slug: string;
  nameEn: string;
  nameEs: string | null;
  termType: string;
  level: number | null;
  parentId: string | null;
  parentSlug: string | null;
  parentNameEn: string | null;
};

export type TalentTaxonomyAssignment = {
  termId: string;
  relationshipType: string;
  isPrimary: boolean;
  proficiencyLevel: string | null;
  yearsExperience: number | null;
  displayOrder: number;
  termSlug: string;
  termNameEn: string;
  termType: string;
  parentNameEn: string | null;
};

export type TalentLanguageRow = {
  id: string;
  languageCode: string;
  languageName: string;
  speakingLevel: string | null;
  isNative: boolean;
  canHost: boolean;
  canSell: boolean;
  canTranslate: boolean;
  canTeach: boolean;
  displayOrder: number;
};

export type TalentServiceAreaRow = {
  id: string;
  serviceKind: string;
  city: string | null;
  region: string | null;
  country: string | null;
  travelRadiusKm: number | null;
  travelFeeRequired: boolean;
  notes: string | null;
  displayOrder: number;
};

export type PortfolioMediaRow = {
  id: string;
  bucketId: string;
  storagePath: string;
  publicUrl: string;
  variantKind: string;
  approvalState: string;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  sortOrder: number;
  createdAt: string;
};

// ─── Loaders ──────────────────────────────────────────────────────────────────

/**
 * Load all taxonomy terms grouped by parent so the form can render a
 * categorised picker. Filtered to non-archived. Returns a flat list — the
 * component groups by termType / parentSlug for display.
 */
export async function loadAllTaxonomyTerms(): Promise<TaxonomyTermPick[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("taxonomy_terms")
    .select("id, slug, name_en, name_es, term_type, level, parent_id")
    .is("archived_at", null)
    .eq("is_active", true)
    .order("term_type", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("slug", { ascending: true });

  if (error) {
    logServerError("roster.loadAllTaxonomyTerms", error);
    return [];
  }

  type Row = {
    id: string;
    slug: string;
    name_en: string | null;
    name_es: string | null;
    term_type: string | null;
    level: number | null;
    parent_id: string | null;
  };
  const rows = (data ?? []) as Row[];

  const byId = new Map<string, Row>();
  for (const r of rows) byId.set(r.id, r);

  return rows.map((r): TaxonomyTermPick => {
    const parent = r.parent_id ? byId.get(r.parent_id) : null;
    return {
      id: r.id,
      slug: r.slug,
      nameEn: r.name_en ?? r.slug,
      nameEs: r.name_es,
      termType: r.term_type ?? "",
      level: r.level,
      parentId: r.parent_id,
      parentSlug: parent?.slug ?? null,
      parentNameEn: parent?.name_en ?? null,
    };
  });
}

export async function loadTalentTaxonomy(
  talentProfileId: string,
): Promise<TalentTaxonomyAssignment[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("talent_profile_taxonomy")
    .select(`
      taxonomy_term_id,
      relationship_type,
      is_primary,
      proficiency_level,
      years_experience,
      display_order,
      taxonomy_terms:taxonomy_term_id (
        slug,
        name_en,
        term_type,
        parent_id
      )
    `)
    .eq("talent_profile_id", talentProfileId)
    .order("display_order", { ascending: true });

  if (error) {
    logServerError("roster.loadTalentTaxonomy", error);
    return [];
  }

  // Resolve parent names in one extra query for nicer labels.
  type Row = {
    taxonomy_term_id: string;
    relationship_type: string;
    is_primary: boolean;
    proficiency_level: string | null;
    years_experience: number | null;
    display_order: number;
    taxonomy_terms: unknown;
  };
  const rows = (data ?? []) as Row[];

  const parentIds: string[] = [];
  for (const r of rows) {
    const t = (Array.isArray(r.taxonomy_terms) ? r.taxonomy_terms[0] : r.taxonomy_terms) as
      | { parent_id?: string | null } | null;
    if (t?.parent_id) parentIds.push(t.parent_id);
  }
  const parentMap = new Map<string, string>();
  if (parentIds.length > 0) {
    const { data: parents } = await admin
      .from("taxonomy_terms")
      .select("id, name_en")
      .in("id", parentIds);
    for (const p of (parents ?? []) as { id: string; name_en: string | null }[]) {
      parentMap.set(p.id, p.name_en ?? "—");
    }
  }

  return rows.map((r): TalentTaxonomyAssignment => {
    const term = (Array.isArray(r.taxonomy_terms) ? r.taxonomy_terms[0] : r.taxonomy_terms) as
      | { slug?: string; name_en?: string | null; term_type?: string | null; parent_id?: string | null }
      | null;
    return {
      termId: r.taxonomy_term_id,
      relationshipType: r.relationship_type,
      isPrimary: r.is_primary,
      proficiencyLevel: r.proficiency_level,
      yearsExperience: r.years_experience,
      displayOrder: r.display_order,
      termSlug: term?.slug ?? "",
      termNameEn: term?.name_en ?? term?.slug ?? "",
      termType: term?.term_type ?? "",
      parentNameEn: term?.parent_id ? parentMap.get(term.parent_id) ?? null : null,
    };
  });
}

export async function loadTalentLanguages(
  tenantId: string,
  talentProfileId: string,
): Promise<TalentLanguageRow[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("talent_languages")
    .select(`
      id, language_code, language_name, speaking_level,
      is_native, can_host, can_sell, can_translate, can_teach, display_order
    `)
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .order("display_order", { ascending: true });

  if (error) {
    logServerError("roster.loadTalentLanguages", error);
    return [];
  }

  return ((data ?? []) as Array<{
    id: string;
    language_code: string;
    language_name: string;
    speaking_level: string | null;
    is_native: boolean;
    can_host: boolean;
    can_sell: boolean;
    can_translate: boolean;
    can_teach: boolean;
    display_order: number;
  }>).map((r) => ({
    id: r.id,
    languageCode: r.language_code,
    languageName: r.language_name,
    speakingLevel: r.speaking_level,
    isNative: r.is_native,
    canHost: r.can_host,
    canSell: r.can_sell,
    canTranslate: r.can_translate,
    canTeach: r.can_teach,
    displayOrder: r.display_order,
  }));
}

export async function loadTalentServiceAreas(
  tenantId: string,
  talentProfileId: string,
): Promise<TalentServiceAreaRow[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  // Canonical read: resolve the city label from the curated `locations`
  // join (the source of truth), not the legacy free-text `city` column.
  const { data, error } = await admin
    .from("talent_service_areas")
    .select(`
      id, service_kind, city, travel_radius_km, travel_fee_required, notes, display_order,
      location_id, locations ( display_name_en, country_code )
    `)
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .order("display_order", { ascending: true });

  if (error) {
    logServerError("roster.loadTalentServiceAreas", error);
    return [];
  }

  return ((data ?? []) as Array<{
    id: string;
    service_kind: string;
    city: string | null;
    travel_radius_km: number | null;
    travel_fee_required: boolean;
    notes: string | null;
    display_order: number;
    location_id: string | null;
    locations:
      | { display_name_en: string | null; country_code: string | null }
      | { display_name_en: string | null; country_code: string | null }[]
      | null;
  }>).map((r) => {
    const loc = Array.isArray(r.locations) ? r.locations[0] : r.locations;
    return {
      id: r.id,
      serviceKind: r.service_kind,
      // Canonical label first; legacy free-text only as a last-resort
      // fallback for any pre-conversion row (none expected).
      city: loc?.display_name_en ?? r.city,
      region: null,
      country: loc?.country_code ?? null,
      travelRadiusKm: r.travel_radius_km,
      travelFeeRequired: r.travel_fee_required,
      notes: r.notes,
      displayOrder: r.display_order,
    };
  });
}

/**
 * Load every non-deleted media asset for a talent (across variant_kinds).
 * Returns rows with publicUrl resolved. Sorted with card photos first,
 * then portfolio variants by sort_order.
 */
export async function loadTalentPortfolio(
  talentProfileId: string,
): Promise<PortfolioMediaRow[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("media_assets")
    .select(`
      id, bucket_id, storage_path, variant_kind, approval_state,
      width, height, file_size, sort_order, created_at
    `)
    .eq("owner_talent_profile_id", talentProfileId)
    .is("deleted_at", null)
    .order("variant_kind", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    logServerError("roster.loadTalentPortfolio", error);
    return [];
  }

  return ((data ?? []) as Array<{
    id: string;
    bucket_id: string;
    storage_path: string;
    variant_kind: string;
    approval_state: string;
    width: number | null;
    height: number | null;
    file_size: number | null;
    sort_order: number | null;
    created_at: string;
  }>).map((r) => {
    const { data: urlData } = admin.storage.from(r.bucket_id).getPublicUrl(r.storage_path);
    return {
      id: r.id,
      bucketId: r.bucket_id,
      storagePath: r.storage_path,
      publicUrl: urlData.publicUrl,
      variantKind: r.variant_kind,
      approvalState: r.approval_state,
      width: r.width,
      height: r.height,
      fileSize: r.file_size,
      sortOrder: r.sort_order ?? 0,
      createdAt: r.created_at,
    };
  });
}
