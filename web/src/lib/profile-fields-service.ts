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
  label: string;
  tier: FieldTier;
  section: string;
  subsection: "physical" | "wardrobe" | null;
  kind: FieldKind;
  placeholder: string | null;
  helper: string | null;
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
};

type RecommendationRow = {
  field_definition_id: string;
  taxonomy_term_id: string;
  relationship: FieldRelationship;
  // Supabase typed select returns relations as arrays (zero-or-many).
  // Each row points to exactly one taxonomy_term but the type allows
  // an array — we read [0] in the merge.
  taxonomy_terms: Array<{ slug: string }>;
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

  const { data: recs, error: recsErr } = await supabase
    .from("profile_field_recommendations")
    .select("field_definition_id, taxonomy_term_id, relationship, taxonomy_terms(slug)");
  if (recsErr) throw new Error(`profile_field_recommendations: ${recsErr.message}`);

  let overrides: WorkspaceOverrideRow[] = [];
  if (opts.tenantId) {
    const { data, error } = await supabase
      .from("workspace_profile_field_settings")
      .select("*")
      .eq("tenant_id", opts.tenantId);
    if (error) throw new Error(`workspace_profile_field_settings: ${error.message}`);
    overrides = (data ?? []) as WorkspaceOverrideRow[];
  }

  return mergeCatalog(
    (defs ?? []) as FieldDefinitionRow[],
    (recs ?? []) as unknown as RecommendationRow[],
    overrides,
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

  return defs.map((d) => {
    const o = overrideById.get(d.id);
    const fieldRecs = recsByField.get(d.id) ?? [];
    const appliesTo = uniqSlugs(fieldRecs.filter((r) => r.relationship === "applies"));
    const requiredFor = uniqSlugs(fieldRecs.filter((r) => r.relationship === "required"));
    const recommendedFor = uniqSlugs(fieldRecs.filter((r) => r.relationship === "recommended"));

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

    return {
      fieldKey: d.field_key,
      label: o?.custom_label ?? d.label,
      tier: d.tier,
      section: d.section,
      subsection: d.subsection,
      kind: d.kind,
      placeholder: d.placeholder,
      helper: o?.custom_helper ?? d.helper,
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
      appliesTo,
      requiredFor,
      recommendedFor,
      enabled,
    };
  });
}

function uniqSlugs(rows: RecommendationRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const slug = r.taxonomy_terms?.[0]?.slug;
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
