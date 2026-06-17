/**
 * Profile Fields Service — Master Catalog read layer.
 *
 * Reads `profile_field_definitions`, `profile_field_recommendations`,
 * `workspace_profile_field_settings`, and `talent_profile_field_values`
 * to produce the merged catalog the rendering surfaces consume.
 *
 * Pattern mirrors the prototype's `_field-catalog.ts` so consumers can
 * swap from constants to DB without rewriting call sites:
 *   - `loadFieldCatalog()`         → like FIELD_CATALOG (full list)
 *   - `loadFieldsForType(parents)` → like fieldsForType()
 *   - `loadFieldsForMode(mode)`    → like fieldsForMode()
 *   - `getTalentFieldValues(id)`   → fetches the talent's per-field values
 *
 * Workspace overrides merge in transparently when a `tenantId` is
 * supplied. Without a tenantId, you get the platform defaults.
 *
 * The DB schema is in supabase/migrations/20260901120000..120300.
 * Seed: supabase/migrations/20260901120400 (auto-generated from the
 * frontend constants — single source of truth).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { filterTenantCatalogFieldsByEnabledTaxonomy } from "@/lib/field-engine/tenant-catalog-scope";
// The ONE universal localized-value resolver. label/helper/placeholder are
// stored as `*_i18n jsonb` maps (migration 20260615211100); resolve them with
// the SAME helper admin-taxonomy.ts uses — never a second i18n resolver.
import { localizedValue, type LocalizedMap } from "@/lib/i18n/resolve-localized";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin/locales";
// PostgREST caps a single SELECT at `max-rows` (1000 by default). `taxonomy_terms`
// has >1000 rows, so an un-paged `.select()` SILENTLY drops terms past the cap —
// including parent_category rows the field-recommendation join needs (this is what
// made transportation/hospitality/event-staff/security type-specific fields vanish
// from the tenant-scoped catalog, falling the DB-backed wizard back to static for
// those types). The shared paginator pages by `id` so every term is loaded.
import { fetchAllTaxonomyTerms } from "@/lib/supabase/paged";

// ─── Types ─────────────────────────────────────────────────────────────

export type FieldTier = "universal" | "global" | "type-specific";

export type FieldKind =
  | "text" | "number" | "select" | "multiselect"
  | "chips" | "date" | "toggle" | "textarea";

export type FieldVisibilityChannel = "public" | "agency" | "private";

export type FieldRelationship = "applies" | "required" | "recommended";

export type FieldConsumerMode = "registration" | "editDrawer" | "public" | "directory";

/** Catalog field with workspace overrides merged in. */
export type ResolvedFieldDefinition = {
  id: string;
  fieldKey: string;
  label: string;
  tier: FieldTier;
  section: string;
  subsection: "physical" | "wardrobe" | null;
  kind: FieldKind;
  placeholder: string | null;
  helper: string | null;
  options: ReadonlyArray<string> | null;
  isOptional: boolean;
  isSensitive: boolean;
  defaultVisibility: ReadonlyArray<FieldVisibilityChannel>;
  showInRegistration: boolean;
  showInEditDrawer: boolean;
  showInPublic: boolean;
  showInDirectory: boolean;
  adminOnly: boolean;
  talentEditable: boolean;
  requiresReviewOnChange: boolean;
  isSearchable: boolean;
  countMin: number | null;
  displayOrder: number;
  note: string | null;
  /** How the field renders: 'catalog' = generic catalog renderer; 'bespoke'
   *  = a hand-coded editor component. Added in the field-engine unification
   *  (P0 migration 20260610090000). Defaults to 'catalog' for rows predating
   *  the column. */
  renderMode: "catalog" | "bespoke";
  /** Where the value is stored: 'field_values' = talent_profile_field_values
   *  bag; 'dedicated' = a dedicated column / structured store. */
  storageMode: "field_values" | "dedicated";
  /** Talent-type slugs (TaxonomyParentId) where this field applies. */
  appliesTo: ReadonlyArray<string>;
  /** Talent-type slugs where this field is required for publish. */
  requiredFor: ReadonlyArray<string>;
  /** Talent-type slugs where this field is recommended (above other optionals). */
  recommendedFor: ReadonlyArray<string>;
  /** When TRUE, this field has been disabled for this workspace. Universal
   *  tier ignores enabled_override and is always TRUE. */
  enabled: boolean;
};

export type TalentFieldValue = {
  fieldKey: string;
  value: unknown; // JSONB; render layer parses based on `kind`
  visibilityOverride: ReadonlyArray<FieldVisibilityChannel> | null;
  workflowState: "live" | "pending" | "rejected";
};

// ─── Internal row shapes (DB) ──────────────────────────────────────────

type FieldDefinitionRow = {
  id: string;
  field_key: string;
  /** Per-locale label map { "en": …, "es": … }. The flat `label`/`helper`/
   *  `placeholder` columns were DROPPED by migration
   *  20260615211100_ml_fields_sections_groups_i18n.sql in favor of these jsonb
   *  maps; resolve via localizedValue(). */
  label_i18n: LocalizedMap | null;
  helper_i18n: LocalizedMap | null;
  placeholder_i18n: LocalizedMap | null;
  tier: FieldTier;
  section: string;
  subsection: "physical" | "wardrobe" | null;
  kind: FieldKind;
  options: string[] | null;
  is_optional: boolean;
  is_sensitive: boolean;
  default_visibility: string[];
  show_in_registration: boolean;
  show_in_edit_drawer: boolean;
  show_in_public: boolean;
  show_in_directory: boolean;
  admin_only: boolean;
  talent_editable: boolean;
  requires_review_on_change: boolean;
  is_searchable: boolean;
  count_min: number | null;
  display_order: number;
  note: string | null;
  deprecated_at: string | null;
  render_mode: "catalog" | "bespoke" | null;
  storage_mode: "field_values" | "dedicated" | null;
};

type RecommendationRow = {
  field_definition_id: string;
  taxonomy_term_id: string;
  relationship: FieldRelationship;
  // NOTE: The `taxonomy_terms` embedded relation was removed in the P2
  // bug fix (the PostgREST join did not resolve at runtime, causing all
  // appliesTo/requiredFor/recommendedFor arrays to come back empty).
  // taxonomy_terms is now fetched in a separate query and joined in code.
  // See the `loadFieldCatalog` fix and the `slugByTermId` map.
};

type WorkspaceOverrideRow = {
  field_definition_id: string;
  enabled_override: boolean | null;
  required_override: boolean | null;
  show_in_registration_override: boolean | null;
  show_in_edit_drawer_override: boolean | null;
  show_in_public_override: boolean | null;
  show_in_directory_override: boolean | null;
  admin_only_override: boolean | null;
  talent_editable_override: boolean | null;
  requires_review_on_change_override: boolean | null;
  custom_label: string | null;
  custom_helper: string | null;
  display_order_override: number | null;
  default_visibility_override: string[] | null;
};

type FieldValueRow = {
  field_definition_id: string;
  value: unknown;
  visibility_override: string[] | null;
  workflow_state: "live" | "pending" | "rejected";
  profile_field_definitions: Array<{ field_key: string }>;
};

type TenantCatalogTermRow = {
  id: string;
  parent_id: string | null;
  is_active: boolean | null;
};

type TenantCatalogSettingRow = {
  taxonomy_term_id: string;
  is_enabled: boolean | null;
};

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Load the full catalog. Heavy query (200+ rows + recommendations);
 * cache via Next.js `unstable_cache` or React `cache()` per request in
 * production. Catalog changes infrequently — invalidate on writes.
 */
export async function loadFieldCatalog(
  supabase: SupabaseClient,
  opts: { tenantId?: string | null } = {},
): Promise<ResolvedFieldDefinition[]> {
  const { data: defs, error: defsErr } = await supabase
    .from("profile_field_definitions")
    .select("*")
    .is("deprecated_at", null)
    .order("display_order", { ascending: true });
  if (defsErr) throw new Error(`profile_field_definitions: ${defsErr.message}`);

  // P2 bug fix: the original query used `taxonomy_terms(slug)` as a
  // PostgREST embedded relation, which did NOT resolve at runtime — every
  // recommendation row came back with taxonomy_terms: [] (or undefined),
  // so appliesTo / requiredFor / recommendedFor were always empty arrays.
  //
  // Fix: fetch recommendations and taxonomy_terms in parallel, then join
  // the slug in code via `slugByTermId`. This mirrors the pattern used in
  // web/src/lib/field-engine/resolve-talent-fields.ts which fetches recs
  // and taxonomy_terms separately and joins by taxonomy_term_id.
  // term-id → slug lookup for resolving recommendation slugs. NOTE:
  // `taxonomy_terms` has NO `deprecated_at` column (it uses `is_active`); an
  // earlier version filtered on it and threw at runtime. We fetch ALL terms
  // here (PAGED — the table exceeds the PostgREST 1000-row cap) — the map is
  // only consulted for term-ids a recommendation references, so including any
  // inactive rows is harmless and avoids dropping a slug.
  const [recsResult, allTermsForSlug] = await Promise.all([
    supabase
      .from("profile_field_recommendations")
      .select("field_definition_id, taxonomy_term_id, relationship"),
    fetchAllTaxonomyTerms<{ id: string; slug: string }>(supabase, "id, slug"),
  ]);
  if (recsResult.error) throw new Error(`profile_field_recommendations: ${recsResult.error.message}`);
  const recs = recsResult.data ?? [];
  // Build a term-id → slug lookup so `uniqSlugs` can resolve slugs without
  // relying on the PostgREST embedded join that failed to resolve.
  const slugByTermId = new Map<string, string>(
    allTermsForSlug.map((t) => [t.id, t.slug] as const),
  );

  let overrides: WorkspaceOverrideRow[] = [];
  if (opts.tenantId) {
    const { data, error } = await supabase
      .from("workspace_profile_field_settings")
      .select("*")
      .eq("tenant_id", opts.tenantId);
    if (error) throw new Error(`workspace_profile_field_settings: ${error.message}`);
    overrides = (data ?? []) as WorkspaceOverrideRow[];
  }

  const merged = mergeCatalog(
    (defs ?? []) as FieldDefinitionRow[],
    recs as RecommendationRow[],
    overrides,
    slugByTermId,
  );
  if (!opts.tenantId) return merged;

  // PAGED — see fetchAllTaxonomyTerms. An un-paged fetch here dropped enabled
  // parent_category terms past row 1000, so their type-specific fields were
  // wrongly filtered out of the tenant catalog.
  const terms = await fetchAllTaxonomyTerms<{
    id: string;
    parent_id: string | null;
    is_active: boolean | null;
  }>(supabase, "id, parent_id, is_active", (q) => q.eq("is_active", true));

  const { data: taxonomySettings, error: taxonomySettingsErr } = await supabase
    .from("agency_taxonomy_settings")
    .select("taxonomy_term_id, is_enabled")
    .eq("tenant_id", opts.tenantId);
  if (taxonomySettingsErr) {
    throw new Error(`agency_taxonomy_settings: ${taxonomySettingsErr.message}`);
  }

  return filterTenantCatalogFieldsByEnabledTaxonomy(
    merged,
    recs as RecommendationRow[],
    terms as TenantCatalogTermRow[],
    (taxonomySettings ?? []) as TenantCatalogSettingRow[],
  );
}

/** All catalog fields applicable to a given talent type or types. */
export async function loadFieldsForType(
  supabase: SupabaseClient,
  parentTypeSlugs: string | ReadonlyArray<string>,
  opts: { tenantId?: string | null } = {},
): Promise<ResolvedFieldDefinition[]> {
  const slugs = Array.isArray(parentTypeSlugs) ? parentTypeSlugs : [parentTypeSlugs];
  const catalog = await loadFieldCatalog(supabase, opts);
  return catalog.filter((f) =>
    f.tier !== "type-specific"
    || f.appliesTo.length === 0
    || f.appliesTo.some((p) => slugs.includes(p)),
  );
}

/** Fields visible on a given consumer surface (registration, edit, public, directory). */
export async function loadFieldsForMode(
  supabase: SupabaseClient,
  mode: FieldConsumerMode,
  parentTypeSlugs?: string | ReadonlyArray<string>,
  opts: { tenantId?: string | null } = {},
): Promise<ResolvedFieldDefinition[]> {
  const candidates = parentTypeSlugs
    ? await loadFieldsForType(supabase, parentTypeSlugs, opts)
    : await loadFieldCatalog(supabase, opts);
  return candidates.filter((f) => {
    if (!f.enabled) return false;
    switch (mode) {
      case "registration": return f.showInRegistration && f.tier !== "global";
      case "editDrawer":   return f.showInEditDrawer;
      case "public":       return f.showInPublic;
      case "directory":    return f.showInDirectory;
    }
  });
}

/** Fetch the talent's stored per-field values. Returns one row per
 *  filled field; absence = not filled. */
export async function getTalentFieldValues(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<TalentFieldValue[]> {
  const { data, error } = await supabase
    .from("talent_profile_field_values")
    .select("field_definition_id, value, visibility_override, workflow_state, profile_field_definitions(field_key)")
    .eq("talent_profile_id", talentProfileId);
  if (error) throw new Error(`talent_profile_field_values: ${error.message}`);
  return ((data ?? []) as unknown as FieldValueRow[]).map((row) => ({
    fieldKey: row.profile_field_definitions?.[0]?.field_key ?? "",
    value: row.value,
    visibilityOverride: (row.visibility_override ?? null) as ReadonlyArray<FieldVisibilityChannel> | null,
    workflowState: row.workflow_state,
  }));
}

/** Whether a specific field is required for publish for a given set of
 *  talent types. Considers workspace required_override. */
export function isRequiredForType(
  field: ResolvedFieldDefinition,
  parentTypeSlugs: string | ReadonlyArray<string>,
): boolean {
  if (field.tier === "universal") return !field.isOptional;
  const slugs = Array.isArray(parentTypeSlugs) ? parentTypeSlugs : [parentTypeSlugs];
  return field.requiredFor.some((p) => slugs.includes(p));
}

/** Profile completeness — percent + missing list. Mirrors the
 *  prototype's `computeProfileCompleteness` but reads from DB. */
export type ProfileCompleteness = {
  percent: number;
  applicable: number;
  filled: number;
  missing: ReadonlyArray<{ fieldKey: string; label: string }>;
};

export function computeProfileCompleteness(
  fields: ReadonlyArray<ResolvedFieldDefinition>,
  values: ReadonlyArray<TalentFieldValue>,
  parentTypeSlugs: string | ReadonlyArray<string>,
): ProfileCompleteness {
  const slugs = Array.isArray(parentTypeSlugs) ? parentTypeSlugs : [parentTypeSlugs];
  const applicable = fields.filter((f) =>
    f.enabled
    && (f.tier !== "type-specific" || f.appliesTo.some((p) => slugs.includes(p))),
  );
  const filledMap = new Map(values.map((v) => [v.fieldKey, v]));
  const missing: Array<{ fieldKey: string; label: string }> = [];
  let filled = 0;
  for (const f of applicable) {
    const v = filledMap.get(f.fieldKey);
    if (isFilled(v?.value, f.countMin ?? null)) {
      filled++;
    } else {
      missing.push({ fieldKey: f.fieldKey, label: f.label });
    }
  }
  const percent = applicable.length === 0
    ? 0
    : Math.round((filled / applicable.length) * 100);
  return { percent, applicable: applicable.length, filled, missing };
}

// ─── Internals ─────────────────────────────────────────────────────────

function mergeCatalog(
  defs: FieldDefinitionRow[],
  recs: RecommendationRow[],
  overrides: WorkspaceOverrideRow[],
  /** term-id → slug lookup built from a separate taxonomy_terms query.
   *  P2 bug fix: the previous implementation relied on a PostgREST
   *  embedded join (`taxonomy_terms(slug)`) that did not resolve at
   *  runtime, returning empty arrays for every applicability field. */
  slugByTermId: Map<string, string>,
): ResolvedFieldDefinition[] {
  const overrideById = new Map<string, WorkspaceOverrideRow>(
    overrides.map((o) => [o.field_definition_id, o]),
  );
  const recsByField = new Map<string, RecommendationRow[]>();
  for (const r of recs) {
    const arr = recsByField.get(r.field_definition_id) ?? [];
    arr.push(r);
    recsByField.set(r.field_definition_id, arr);
  }

  return defs.map((d) =>
    resolveFieldDefinition(d, overrideById.get(d.id), recsByField.get(d.id) ?? [], slugByTermId),
  );
}

/**
 * Pure row → ResolvedFieldDefinition mapping. Exported (the module is
 * server-only otherwise) so the i18n label resolution is unit-testable in
 * isolation, without a Supabase mock.
 *
 * F1 fix: label/helper/placeholder are read from the `label_i18n` /
 * `helper_i18n` / `placeholder_i18n` jsonb maps (the flat columns were dropped
 * by migration 20260615211100) via the shared `localizedValue()` resolver —
 * the same helper admin-taxonomy.ts uses. Before this fix the mapper read the
 * non-existent flat columns, so every catalog label resolved to `undefined`
 * and the DB-backed wizard/drawer rendered raw field keys.
 *
 * Override precedence is preserved: a workspace `custom_label`/`custom_helper`
 * (still flat text columns on workspace_profile_field_settings — there is no
 * custom_label_i18n column on that table yet, so workspace label overrides are
 * EN-only by design) wins over the resolved i18n value.
 */
export function resolveFieldDefinition(
  d: FieldDefinitionRow,
  o: WorkspaceOverrideRow | undefined,
  fieldRecs: RecommendationRow[],
  slugByTermId: Map<string, string>,
): ResolvedFieldDefinition {
  const appliesTo = uniqSlugs(fieldRecs.filter((r) => r.relationship === "applies"), slugByTermId);
  const requiredFor = uniqSlugs(fieldRecs.filter((r) => r.relationship === "required"), slugByTermId);
  const recommendedFor = uniqSlugs(fieldRecs.filter((r) => r.relationship === "recommended"), slugByTermId);

  // Merge order: catalog default → workspace override.
  const enabled = d.tier === "universal"
    ? true
    : pickBool(o?.enabled_override, true);
  // required_override: TRUE → required (so isOptional FALSE), FALSE
  // → optional (isOptional TRUE), null/undefined → fall back to catalog.
  const requiredOverride = o?.required_override;
  const isOptional = requiredOverride === null || requiredOverride === undefined
    ? d.is_optional
    : !requiredOverride;
  const showInRegistration = pickBool(o?.show_in_registration_override, d.show_in_registration);
  const showInEditDrawer = pickBool(o?.show_in_edit_drawer_override, d.show_in_edit_drawer);
  const showInPublic = pickBool(o?.show_in_public_override, d.show_in_public);
  const showInDirectory = pickBool(o?.show_in_directory_override, d.show_in_directory);
  const adminOnly = pickBool(o?.admin_only_override, d.admin_only);
  const talentEditable = pickBool(o?.talent_editable_override, d.talent_editable) && !adminOnly;
  const requiresReviewOnChange = pickBool(
    o?.requires_review_on_change_override,
    d.requires_review_on_change,
  );
  const defaultVisibility = (o?.default_visibility_override ?? d.default_visibility) as ReadonlyArray<FieldVisibilityChannel>;

  // Resolve the translatable values from the i18n maps. label coalesces to the
  // field_key as a last resort so the UI is never blank even for an unseeded
  // row; helper/placeholder coalesce to null (they are optional).
  const resolvedLabel = localizedValue(d.label_i18n, DEFAULT_PLATFORM_LOCALE, [DEFAULT_PLATFORM_LOCALE]);
  const resolvedHelper = localizedValue(d.helper_i18n, DEFAULT_PLATFORM_LOCALE, [DEFAULT_PLATFORM_LOCALE]);
  const resolvedPlaceholder = localizedValue(d.placeholder_i18n, DEFAULT_PLATFORM_LOCALE, [DEFAULT_PLATFORM_LOCALE]);

  return {
    id: d.id,
    fieldKey: d.field_key,
    label: nonEmptyString(o?.custom_label) ?? nonEmptyString(resolvedLabel) ?? d.field_key,
    tier: d.tier,
    section: d.section,
    subsection: d.subsection,
    kind: d.kind,
    placeholder: nonEmptyString(resolvedPlaceholder),
    helper: nonEmptyString(o?.custom_helper) ?? nonEmptyString(resolvedHelper),
    options: d.options,
    isOptional,
    isSensitive: d.is_sensitive,
    defaultVisibility,
    showInRegistration,
    showInEditDrawer,
    showInPublic,
    showInDirectory,
    adminOnly,
    talentEditable,
    requiresReviewOnChange,
    isSearchable: d.is_searchable,
    countMin: d.count_min,
    displayOrder: o?.display_order_override ?? d.display_order,
    note: d.note,
    renderMode: d.render_mode ?? "catalog",
    storageMode: d.storage_mode ?? "field_values",
    appliesTo,
    requiredFor,
    recommendedFor,
    enabled,
  };
}

/** Trim + null-coalesce: returns the trimmed string, or null when empty/blank.
 *  Lets the override and i18n values flow through one coalesce chain so an
 *  empty custom_label/blank i18n entry falls through to the next source. */
function nonEmptyString(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** P2 bug fix: resolve slugs via `slugByTermId` map (separate query)
 *  rather than the PostgREST embedded join that failed to resolve. */
function uniqSlugs(rows: RecommendationRow[], slugByTermId: Map<string, string>): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const slug = slugByTermId.get(r.taxonomy_term_id);
    if (slug) set.add(slug);
  }
  return [...set];
}

function pickBool(override: boolean | null | undefined, fallback: boolean): boolean {
  if (override === null || override === undefined) return fallback;
  return override;
}

function isFilled(value: unknown, countMin: number | null): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length > 0 && t !== "—" && t !== "-";
  }
  if (Array.isArray(value)) {
    return value.length >= (countMin ?? 1);
  }
  if (typeof value === "boolean" || typeof value === "number") return true;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return false;
}
