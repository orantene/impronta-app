// src/lib/field-engine/directory-field-catalog-registry.ts
//
// T3.2b — FROZEN DIRECTORY FIELD CATALOG (the last `field_definitions` reader
// collapse).
//
// The directory filter sidebar + directory card display catalog used to read
// their row SKELETON (key, labels, value_type, taxonomy_kind, sort_order,
// option config) from legacy System A `field_definitions`, with a per-tenant
// override LEG keyed on `field_definitions.tenant_id`. Two facts make that read
// removable:
//
//   1. The VISIBILITY DECISION is already 100% canonical (System B). Every
//      directory reader routes each row through
//      `isResolvedFieldVisible{InDirectoryFilter,OnDirectoryCard}` (public-
//      surface-visibility.ts), which reads `profile_field_definitions` +
//      `workspace_profile_field_settings` and IGNORES the legacy
//      `directory_filter_visible` / `card_visible` flags (Sub-Task 5). So the
//      `field_definitions` row supplied ONLY the structural skeleton, never the
//      live visibility.
//
//   2. The per-tenant override leg is UNUSED. Prod (2026-06-11):
//      `field_definitions WHERE tenant_id IS NOT NULL` = 0 of 39 rows, and the
//      B override home (`workspace_profile_field_settings`) carries 0
//      `show_in_directory_card_override` / `show_in_directory_filter_override`
//      rows. So the "global + tenant" two-leg read always resolved to the
//      global (`tenant_id IS NULL`) canonical set.
//
//   3. The facet VOCAB/CONFIG already lives on System B
//      (`profile_field_definitions.directory_filter_config`, T3.1) and is
//      overlaid at read time via `loadDirectoryFacetConfigByLegacyKey`. The
//      `config` carried on the frozen rows here is the A baseline + the safe
//      fallback for any key T3.1 hasn't migrated (byte-identical to today).
//
// So the skeleton is a STABLE registry — exactly the "frozen-registry skeleton
// + live B liveness" pattern T3.2 used for dashboard-nav. This module is that
// frozen skeleton, captured 1:1 from prod ref `pluhdapdnuiulvxmyspd`
// (2026-06-11) for the canonical (`tenant_id IS NULL`) catalog. The directory
// readers consume it instead of querying `field_definitions`, then re-gate each
// row on live B via the same resolver they already called. NET: the rendered
// sidebar + card catalog is byte-identical to the prior global+empty-tenant
// output, with ZERO `field_definitions` reads.
//
// WHY A FROZEN CONSTANT (not a B query): System B `profile_field_definitions`
// has no `taxonomy_kind` / `value_type` columns and no rows for the A-only
// directory keys (talent_type, location, skills, the social-URL keys,
// display_name, the text `gender` chip). A naive table swap would lose the
// primary `talent_type` facet, the location facet, taxonomy_kind on every
// taxonomy facet, and the date `date_of_birth` value_type — a visible
// regression. The skeleton is presentational metadata, governed by the live B
// flags, so freezing it is the correct, parity-preserving move.
//
// MAINTENANCE: when a directory field's label / order / taxonomy_kind /
// value_type changes, update the matching row here. Visibility changes do NOT
// require a code change — they flow live from `profile_field_definitions`
// (admin Card/Filter studio writes those, see site-admin/server/directory-
// catalogs.ts). When System A is dropped (T3.3) this module stays — it is the
// canonical home of the directory skeleton metadata B does not (yet) carry.

import "server-only";

/** A frozen directory-catalog row — the structural skeleton the directory
 *  readers used to pull from `field_definitions` (canonical, tenant_id NULL).
 *  Mirrors the columns the readers consume; legacy flag columns
 *  (`directory_filter_visible`, `card_visible`, `active`, `archived_at`,
 *  `internal_only`, `public_visible`, `profile_visible`) are SYNTHESIZED as the
 *  active/visible defaults the resolver expects, because the live gate is the
 *  canonical resolver, not these flags. */
export type DirectoryCatalogRegistryRow = {
  /** Legacy `field_definitions.key`. */
  key: string;
  /** Legacy `field_definitions.id` (canonical row). Some value-store joins key
   *  on this; preserved 1:1 from prod so nothing keyed on the A def-id breaks. */
  id: string;
  label_en: string;
  label_es: string | null;
  value_type: string;
  taxonomy_kind: string | null;
  /** Within-group display order. */
  sort_order: number;
  /** The owning field group's `sort_order` (for cross-group catalog ordering;
   *  ungrouped = UNGROUPED_GROUP_SORT). */
  group_sort_order: number;
  /** A `field_definitions.config` jsonb — the option/vocab + slider bounds
   *  baseline. The directory readers overlay live B `directory_filter_config`
   *  on top (T3.1); this is the safe fallback for un-migrated keys. */
  config: Record<string, unknown> | null;
  /** True when the row was `filterable=true` in A. The directory filter readers
   *  treat this as the legacy `filterable` signal (kept for the
   *  `isDirectoryFacetEligibleDef` / facet eligibility back-compat). */
  filterable: boolean;
};

const UNGROUPED_GROUP_SORT = 1_000_000;

/**
 * The canonical directory FILTER catalog skeleton — every `field_definitions`
 * row that had `directory_filter_visible=true AND active AND tenant_id IS NULL`
 * in prod, in catalog (group → sort_order → key) order. Captured 1:1 from prod
 * ref `pluhdapdnuiulvxmyspd` (2026-06-11). Liveness is re-gated on live B by the
 * caller; this only supplies the skeleton.
 */
export const DIRECTORY_FILTER_CATALOG_REGISTRY: readonly DirectoryCatalogRegistryRow[] = [
  // ── Group: Basic info (group_sort 10) ──
  { key: "display_name", id: "9d1a3d6f-0000-4000-a000-000000000001", label_en: "Display name", label_es: "Nombre para mostrar", value_type: "text", taxonomy_kind: null, sort_order: 10, group_sort_order: 10, config: {}, filterable: true },
  { key: "gender", id: "9d1a3d6f-0000-4000-a000-000000000002", label_en: "Gender", label_es: "Género", value_type: "text", taxonomy_kind: null, sort_order: 50, group_sort_order: 10, config: { filter_options: ["Woman", "Man", "Non-binary", "Trans woman", "Trans man", "Transgender", "Genderfluid", "Genderqueer", "Agender", "Bigender", "Two-Spirit", "Intersex", "Prefer to self-describe", "Prefer not to say"] }, filterable: false },
  { key: "date_of_birth", id: "9d1a3d6f-0000-4000-a000-000000000003", label_en: "Date of birth", label_es: "Fecha de nacimiento", value_type: "date", taxonomy_kind: null, sort_order: 60, group_sort_order: 10, config: {}, filterable: true },
  { key: "location", id: "9d1a3d6f-0000-4000-a000-000000000004", label_en: "Location", label_es: "Ubicación", value_type: "location", taxonomy_kind: null, sort_order: 120, group_sort_order: 10, config: {}, filterable: true },
  // ── Group: Classification (group_sort 20) ──
  { key: "talent_type", id: "9d1a3d6f-0000-4000-a000-000000000005", label_en: "Talent Type", label_es: "Tipo de talento", value_type: "taxonomy_single", taxonomy_kind: "talent_type", sort_order: 10, group_sort_order: 20, config: {}, filterable: true },
  // ── Group: Abilities (group_sort 30) ──
  { key: "skills", id: "9d1a3d6f-0000-4000-a000-000000000006", label_en: "Skills", label_es: "Habilidades", value_type: "taxonomy_multi", taxonomy_kind: "skill", sort_order: 30, group_sort_order: 30, config: {}, filterable: true },
  { key: "languages", id: "9d1a3d6f-0000-4000-a000-000000000007", label_en: "Languages", label_es: "Idiomas", value_type: "taxonomy_multi", taxonomy_kind: "language", sort_order: 70, group_sort_order: 30, config: {}, filterable: true },
  // ── Group: Physical (group_sort 40) ──
  { key: "height_cm", id: "9d1a3d6f-0000-4000-a000-000000000008", label_en: "Height", label_es: "Altura", value_type: "number", taxonomy_kind: null, sort_order: 10, group_sort_order: 40, config: { max: 230, min: 80 }, filterable: true },
  { key: "eye_color", id: "9d1a3d6f-0000-4000-a000-000000000009", label_en: "Eye color", label_es: "Color de ojos", value_type: "text", taxonomy_kind: null, sort_order: 20, group_sort_order: 40, config: { input: "select", options: [{ value: "brown", label_en: "Brown", label_es: null }, { value: "dark_brown", label_en: "Dark Brown", label_es: null }, { value: "hazel", label_en: "Hazel", label_es: null }, { value: "green", label_en: "Green", label_es: null }, { value: "blue", label_en: "Blue", label_es: null }, { value: "gray", label_en: "Gray", label_es: null }, { value: "black", label_en: "Black", label_es: null }, { value: "other", label_en: "Other", label_es: null }, { value: "amber", label_en: "Amber", label_es: null }] }, filterable: true },
  { key: "tags", id: "9d1a3d6f-0000-4000-a000-00000000000a", label_en: "Tags", label_es: "Etiquetas", value_type: "taxonomy_multi", taxonomy_kind: "tag", sort_order: 20, group_sort_order: 40, config: {}, filterable: true },
  { key: "hair_color", id: "9d1a3d6f-0000-4000-a000-00000000000b", label_en: "Hair color", label_es: "Color de cabello", value_type: "text", taxonomy_kind: null, sort_order: 30, group_sort_order: 40, config: { input: "select", options: [{ value: "black", label_en: "Black", label_es: null }, { value: "dark_brown", label_en: "Dark Brown", label_es: null }, { value: "brown", label_en: "Brown", label_es: null }, { value: "light_brown", label_en: "Light Brown", label_es: null }, { value: "blonde", label_en: "Blonde", label_es: null }, { value: "dark_blonde", label_en: "Dark Blonde", label_es: null }, { value: "red", label_en: "Red", label_es: null }, { value: "auburn", label_en: "Auburn", label_es: null }, { value: "gray", label_en: "Gray", label_es: null }, { value: "other", label_en: "Other", label_es: null }] }, filterable: true },
  { key: "hair_length", id: "9d1a3d6f-0000-4000-a000-00000000000c", label_en: "Hair length", label_es: "Largo de cabello", value_type: "text", taxonomy_kind: null, sort_order: 40, group_sort_order: 40, config: { input: "select", options: [{ value: "shaved", label_en: "Shaved", label_es: null }, { value: "very_short", label_en: "Very Short", label_es: null }, { value: "short", label_en: "Short", label_es: null }, { value: "medium", label_en: "Medium", label_es: null }, { value: "long", label_en: "Long", label_es: null }, { value: "very_long", label_en: "Very Long", label_es: null }, { value: "extra_long", label_en: "Extra long", label_es: null }] }, filterable: true },
  { key: "body_type", id: "9d1a3d6f-0000-4000-a000-00000000000d", label_en: "Body type", label_es: "Tipo de cuerpo", value_type: "text", taxonomy_kind: null, sort_order: 50, group_sort_order: 40, config: { input: "select", options: [{ value: "slim", label_en: "Slim", label_es: null }, { value: "athletic", label_en: "Athletic", label_es: null }, { value: "curvy", label_en: "Curvy", label_es: null }, { value: "muscular", label_en: "Muscular", label_es: null }, { value: "average", label_en: "Average", label_es: null }, { value: "other", label_en: "Other", label_es: null }] }, filterable: true },
  { key: "clothing_size", id: "9d1a3d6f-0000-4000-a000-00000000000e", label_en: "Clothing size", label_es: "Talla de ropa", value_type: "text", taxonomy_kind: null, sort_order: 60, group_sort_order: 40, config: { input: "select", options: [{ value: "xs", label_en: "XS", label_es: null }, { value: "s", label_en: "S", label_es: null }, { value: "m", label_en: "M", label_es: null }, { value: "l", label_en: "L", label_es: null }, { value: "xl", label_en: "XL", label_es: null }, { value: "xxl", label_en: "XXL", label_es: null }] }, filterable: true },
  { key: "shoe_size", id: "9d1a3d6f-0000-4000-a000-00000000000f", label_en: "Shoe size", label_es: "Talla de zapatos", value_type: "text", taxonomy_kind: null, sort_order: 70, group_sort_order: 40, config: {}, filterable: true },
  // ── Group: Experience (group_sort 50) ──
  { key: "experience_level", id: "9d1a3d6f-0000-4000-a000-000000000010", label_en: "Experience level", label_es: "Nivel de experiencia", value_type: "text", taxonomy_kind: null, sort_order: 10, group_sort_order: 50, config: { input: "select", options: [{ value: "beginner", label_en: "Beginner", label_es: null }, { value: "intermediate", label_en: "Intermediate", label_es: null }, { value: "experienced", label_en: "Experienced", label_es: null }, { value: "professional", label_en: "Professional", label_es: null }, { value: "highly_experienced", label_en: "Highly Experienced", label_es: null }] }, filterable: true },
  { key: "years_experience", id: "9d1a3d6f-0000-4000-a000-000000000011", label_en: "Years experience", label_es: "Años de experiencia", value_type: "number", taxonomy_kind: null, sort_order: 20, group_sort_order: 50, config: { max: 60, min: 0 }, filterable: true },
  { key: "notable_work", id: "9d1a3d6f-0000-4000-a000-000000000012", label_en: "Notable work", label_es: "Trabajo destacado", value_type: "textarea", taxonomy_kind: null, sort_order: 30, group_sort_order: 50, config: {}, filterable: true },
  { key: "industries", id: "9d1a3d6f-0000-4000-a000-000000000013", label_en: "Industries", label_es: "Industrias", value_type: "taxonomy_multi", taxonomy_kind: "industry", sort_order: 40, group_sort_order: 50, config: {}, filterable: true },
  { key: "professional_highlights", id: "9d1a3d6f-0000-4000-a000-000000000014", label_en: "Professional highlights", label_es: "Logros profesionales", value_type: "textarea", taxonomy_kind: null, sort_order: 40, group_sort_order: 50, config: {}, filterable: true },
  // ── Group: Availability (group_sort 60) ──
  { key: "availability_status", id: "9d1a3d6f-0000-4000-a000-000000000015", label_en: "Availability status", label_es: "Disponibilidad", value_type: "text", taxonomy_kind: null, sort_order: 10, group_sort_order: 60, config: { input: "select", options: [{ value: "available_now", label_en: "Available Now", label_es: null }, { value: "available_this_week", label_en: "Available This Week", label_es: null }, { value: "available_this_month", label_en: "Available This Month", label_es: null }, { value: "limited", label_en: "Limited Availability", label_es: null }, { value: "by_request", label_en: "By Request", label_es: null }, { value: "unavailable", label_en: "Unavailable", label_es: null }] }, filterable: true },
  { key: "willing_to_travel", id: "9d1a3d6f-0000-4000-a000-000000000016", label_en: "Willing to travel", label_es: "Disponible para viajar", value_type: "boolean", taxonomy_kind: null, sort_order: 20, group_sort_order: 60, config: {}, filterable: true },
  { key: "travel_scope", id: "9d1a3d6f-0000-4000-a000-000000000017", label_en: "Travel scope", label_es: "Alcance de viaje", value_type: "text", taxonomy_kind: null, sort_order: 30, group_sort_order: 60, config: { input: "select", options: [{ value: "local", label_en: "Local Only", label_es: null }, { value: "region", label_en: "State / Region", label_es: null }, { value: "national", label_en: "National", label_es: null }, { value: "international", label_en: "International", label_es: null }] }, filterable: true },
  { key: "available_for", id: "9d1a3d6f-0000-4000-a000-000000000018", label_en: "Available for", label_es: "Disponible para", value_type: "text", taxonomy_kind: null, sort_order: 40, group_sort_order: 60, config: {}, filterable: true },
  { key: "event_types", id: "9d1a3d6f-0000-4000-a000-000000000019", label_en: "Event Types", label_es: "Tipos de evento", value_type: "taxonomy_multi", taxonomy_kind: "event_type", sort_order: 50, group_sort_order: 60, config: {}, filterable: true },
  { key: "fit_labels", id: "9d1a3d6f-0000-4000-a000-00000000001a", label_en: "Fit Labels", label_es: "Etiquetas de ajuste", value_type: "taxonomy_multi", taxonomy_kind: "fit_label", sort_order: 60, group_sort_order: 60, config: {}, filterable: true },
  // ── Group: Links / social (group_sort 70) ──
  { key: "instagram_url", id: "9d1a3d6f-0000-4000-a000-00000000001b", label_en: "Instagram URL", label_es: "URL de Instagram", value_type: "text", taxonomy_kind: null, sort_order: 10, group_sort_order: 70, config: { format: "url", placeholder: "https://instagram.com/yourhandle" }, filterable: true },
  { key: "tiktok_url", id: "9d1a3d6f-0000-4000-a000-00000000001c", label_en: "TikTok URL", label_es: "URL de TikTok", value_type: "text", taxonomy_kind: null, sort_order: 20, group_sort_order: 70, config: { format: "url", placeholder: "https://tiktok.com/@yourhandle" }, filterable: true },
  { key: "website_url", id: "9d1a3d6f-0000-4000-a000-00000000001d", label_en: "Website URL", label_es: "Sitio web", value_type: "text", taxonomy_kind: null, sort_order: 30, group_sort_order: 70, config: { format: "url", placeholder: "https://your-site.com" }, filterable: true },
  { key: "youtube_url", id: "9d1a3d6f-0000-4000-a000-00000000001e", label_en: "YouTube URL", label_es: "URL de YouTube", value_type: "text", taxonomy_kind: null, sort_order: 40, group_sort_order: 70, config: { format: "url", placeholder: "https://youtube.com/..." }, filterable: true },
];

/**
 * The canonical directory CARD candidate catalog skeleton — every
 * `field_definitions` row the Card Design studio + card display catalog
 * considered (`public_visible AND profile_visible AND active AND NOT
 * internal_only AND tenant_id IS NULL`), tagged with the structural metadata
 * the card builder consumes. The live `show_in_directory_card` gate (the actual
 * "renders on the card" decision) is applied by the caller via the canonical
 * resolver; this is only the skeleton.
 *
 * NOTE: this set differs from the FILTER catalog. The card candidate filter is
 * `public_visible AND profile_visible AND NOT internal_only` (NOT
 * `directory_filter_visible`), so it INCLUDES `long_bio` / `short_bio` and
 * EXCLUDES `gender` / `date_of_birth` (both `internal_only=true`). Captured 1:1
 * from prod ref `pluhdapdnuiulvxmyspd` (2026-06-11), in `sort_order, key` order
 * (the studio's order).
 *
 * For the studio's candidate list this is the full public-eligible set; for the
 * card DISPLAY catalog only the resolver-approved subset (today: height_cm,
 * industries, fit_labels) is emitted.
 */
export const DIRECTORY_CARD_CANDIDATE_REGISTRY: readonly DirectoryCatalogRegistryRow[] = [
  { key: "long_bio", id: "9d1a3d6f-0000-4000-b000-000000000001", label_en: "Long Bio", label_es: null, value_type: "textarea", taxonomy_kind: null, sort_order: 0, group_sort_order: UNGROUPED_GROUP_SORT, config: null, filterable: false },
  { key: "short_bio", id: "9d1a3d6f-0000-4000-b000-000000000002", label_en: "Short bio", label_es: null, value_type: "textarea", taxonomy_kind: null, sort_order: 110, group_sort_order: UNGROUPED_GROUP_SORT, config: null, filterable: false },
  // The remaining card candidates share the filter registry's skeleton (same
  // key/label/value_type/taxonomy_kind/sort_order/config), minus the two
  // `internal_only` rows (gender, date_of_birth) the card candidate query
  // excludes.
  ...DIRECTORY_FILTER_CATALOG_REGISTRY.filter(
    (r) => r.key !== "gender" && r.key !== "date_of_birth",
  ),
];

/** Stable cross-group catalog comparator — mirrors `compareFieldCatalogOrder`
 *  in field-driven-filters.ts (group sort → row sort → key). */
export function compareDirectoryCatalogRows(
  a: DirectoryCatalogRegistryRow,
  b: DirectoryCatalogRegistryRow,
): number {
  const ga = a.group_sort_order ?? UNGROUPED_GROUP_SORT;
  const gb = b.group_sort_order ?? UNGROUPED_GROUP_SORT;
  if (ga !== gb) return ga - gb;
  const sa = a.sort_order ?? 0;
  const sb = b.sort_order ?? 0;
  if (sa !== sb) return sa - sb;
  return a.key.localeCompare(b.key);
}
