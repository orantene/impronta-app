import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTranslator } from "@/i18n/messages";
import { CACHE_TAG_DIRECTORY, CACHE_TAG_TAXONOMY } from "@/lib/cache-tags";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import {
  clampHeightRangeToCatalog,
  getCachedDirectoryHeightFilterConfig,
} from "@/lib/directory/directory-filter-catalog";
import {
  DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY,
  fetchDirectorySidebarLayout,
  mergeSidebarItemOrder,
  type DirectorySidebarLayoutRow,
} from "@/lib/directory/directory-sidebar-layout";
import type { DirectoryFieldFacetSelection } from "@/lib/directory/types";
import {
  DIRECTORY_CANONICAL_GENDER_FIELD_KEY,
} from "@/lib/directory/apply-directory-field-facet-filters";

export type DirectoryFilterPresentation = "chips" | "radio" | "grid" | "location" | "height_range" | "age_range";

export type DirectoryFilterOption = {
  id: string;
  label: string;
  count?: number;
};

export type DirectoryFilterSection =
  | {
      fieldKey: string;
      label: string;
      kind: "taxonomy";
      taxonomyKind: string;
      presentation: "chips" | "radio" | "grid";
      options: DirectoryFilterOption[];
    }
  | {
      fieldKey: string;
      label: string;
      kind: "location";
      presentation: "location";
      options: DirectoryFilterOption[];
    }
  | {
      fieldKey: "height_cm";
      label: string;
      kind: "height_range";
      presentation: "height_range";
      sliderMinCm: number;
      sliderMaxCm: number;
    }
  | {
      fieldKey: "date_of_birth";
      label: string;
      kind: "age_range";
      presentation: "age_range";
      sliderMinAge: number;
      sliderMaxAge: number;
    }
  | {
      fieldKey: string;
      fieldDefinitionId: string;
      label: string;
      kind: "profile_gender";
      presentation: "chips" | "radio";
      options: DirectoryFilterOption[];
    }
  | {
      fieldKey: string;
      fieldDefinitionId: string;
      label: string;
      kind: "field_boolean";
      presentation: "chips";
      options: DirectoryFilterOption[];
    }
  | {
      fieldKey: string;
      fieldDefinitionId: string;
      label: string;
      kind: "field_text_enum";
      presentation: "chips" | "radio";
      options: DirectoryFilterOption[];
    };

export type DirectoryFilterSidebarBlock =
  | { kind: "filter_search" }
  | { kind: "section"; section: DirectoryFilterSection; defaultCollapsed?: boolean };

/** Field key for the primary talent classification facet (`field_definitions.key`). */
export const DIRECTORY_TALENT_TYPE_FIELD_KEY = "talent_type" as const;

export type DirectoryTopBarFacetModel = {
  fieldKey: string;
  label: string;
  options: DirectoryFilterOption[];
};

/** @deprecated Use `DirectoryTopBarFacetModel`. */
export type DirectoryTalentTypeTopBarModel = DirectoryTopBarFacetModel;

export type DirectoryFilterSidebarModel = {
  blocks: DirectoryFilterSidebarBlock[];
  /** Horizontal ALL + taxonomy term pills; sidebar omits the same facet when present. */
  topBarFacet?: DirectoryTopBarFacetModel;
};

export type DirectoryFilterRequestContext = {
  taxonomyTermIds: string[];
  locationSlug: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  ageMin: number | null;
  ageMax: number | null;
  query: string;
  fieldFacets?: DirectoryFieldFacetSelection[];
};

/**
 * Which directory surface is being rendered. Agency storefronts scope sections
 * to the agency's roster (`tenantId`); the hub renders cross-agency approved
 * talent (no tenant scope). Making the surface explicit at the type level
 * prevents callers from accidentally passing `tenantId=null` for reasons
 * other than "this is the hub" — see docs/saas/phase-5-6/m6-scope-pre-m0.md §2B.
 */
export type DirectorySurface =
  | { kind: "hub" }
  | { kind: "agency"; tenantId: string };

export function directorySurfaceFromTenantId(
  tenantId: string | null,
): DirectorySurface {
  if (tenantId === null) return { kind: "hub" };
  return { kind: "agency", tenantId };
}

function tenantIdFromDirectorySurface(surface: DirectorySurface): string | null {
  return surface.kind === "agency" ? surface.tenantId : null;
}

type FieldDefinitionRow = {
  key: string;
  label_en: string;
  label_es: string | null;
  value_type: string;
  filterable: boolean;
  directory_filter_visible?: boolean | null;
  active: boolean;
  archived_at: string | null;
  taxonomy_kind: string | null;
  sort_order: number;
};

/** Loaded row includes group embed for ordering (matches admin Fields / talent dashboard). */
type FieldDefinitionQueryRow = FieldDefinitionRow & {
  id?: string;
  config?: Record<string, unknown> | null;
  field_group_id?: string | null;
  field_groups?: { sort_order: number } | { sort_order: number }[] | null;
};

const UNGROUPED_GROUP_SORT = 1_000_000;

function groupSortFromEmbed(
  field_groups: FieldDefinitionQueryRow["field_groups"],
): number {
  const fg = field_groups;
  if (Array.isArray(fg)) return fg[0]?.sort_order ?? UNGROUPED_GROUP_SORT;
  if (fg && typeof fg.sort_order === "number") return fg.sort_order;
  return UNGROUPED_GROUP_SORT;
}

function compareFieldCatalogOrder(a: FieldDefinitionQueryRow, b: FieldDefinitionQueryRow): number {
  const ga = groupSortFromEmbed(a.field_groups);
  const gb = groupSortFromEmbed(b.field_groups);
  if (ga !== gb) return ga - gb;
  const sa = a.sort_order ?? 0;
  const sb = b.sort_order ?? 0;
  if (sa !== sb) return sa - sb;
  return a.key.localeCompare(b.key);
}

function pickLabel(locale: string, en: string, es?: string | null): string {
  if (locale === "es" && es && es.trim()) return es.trim();
  return en.trim();
}

function supportedValueType(valueType: string): valueType is "taxonomy_single" | "taxonomy_multi" | "location" {
  return valueType === "taxonomy_single" || valueType === "taxonomy_multi" || valueType === "location";
}

function taxonomyPresentation(f: FieldDefinitionRow): "radio" | "grid" | "chips" {
  if (f.value_type === "taxonomy_single") return "radio";
  if (f.taxonomy_kind === "language") return "grid";
  return "chips";
}

const FILTERABLE_FIELD_DEF_SELECT =
  "id, key, label_en, label_es, value_type, filterable, config, active, archived_at, taxonomy_kind, sort_order, field_group_id, tenant_id, field_groups(sort_order)";

const DIRECTORY_FILTER_FIELD_DEF_SELECT =
  "id, key, label_en, label_es, value_type, filterable, directory_filter_visible, config, active, archived_at, taxonomy_kind, sort_order, field_group_id, tenant_id, field_groups(sort_order)";

function isMissingDirectoryFilterMigration(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("directory_filter_visible") || text.includes("directory_sidebar_layout");
}

async function fetchDirectoryFilterCatalogRows(
  supabase: SupabaseClient,
  tenantId: string | null,
): Promise<FieldDefinitionQueryRow[]> {
  // Prefer service-role client: `internal_only=true` fields (e.g. gender, date_of_birth) must be
  // readable here so their filter categories appear in the public sidebar. The anon RLS policy
  // restricts `internal_only=true` rows, but `directory_filter_visible` is an independent flag
  // that controls sidebar visibility regardless of profile-page visibility.
  const svc = createServiceRoleClient();
  const client = svc ?? supabase;

  const modern = await client
    .from("field_definitions")
    .select(DIRECTORY_FILTER_FIELD_DEF_SELECT)
    .eq("directory_filter_visible", true)
    .eq("active", true)
    .is("archived_at", null);

  if (modern.error && isMissingDirectoryFilterMigration(modern.error)) {
    const legacy = await client
      .from("field_definitions")
      .select(FILTERABLE_FIELD_DEF_SELECT)
      .eq("filterable", true)
      .eq("active", true)
      .is("archived_at", null);
    if (legacy.error) {
      logServerError("directory/filter-sections/field_definitions_legacy", legacy.error);
      return [];
    }
    return filterFieldCatalogByTenant(
      (legacy.data ?? []) as FieldDefinitionQueryRow[],
      tenantId,
    );
  }

  if (modern.error) {
    logServerError("directory/filter-sections/field_definitions", modern.error);
    return [];
  }
  return filterFieldCatalogByTenant(
    (modern.data ?? []) as FieldDefinitionQueryRow[],
    tenantId,
  );
}

/**
 * Phase 6: field_definitions can be canonical (tenant_id NULL, visible to all
 * tenants) or agency-local (tenant_id = agency, visible only to that agency).
 * Public storefront sees canonical rows + the current tenant's own rows only.
 * Hub/marketing/app (tenantId null) see canonical rows only.
 */
function filterFieldCatalogByTenant(
  rows: FieldDefinitionQueryRow[],
  tenantId: string | null,
): FieldDefinitionQueryRow[] {
  return rows.filter((r) => {
    const rowTenant = (r as { tenant_id?: string | null }).tenant_id ?? null;
    if (rowTenant === null) return true;
    return tenantId !== null && rowTenant === tenantId;
  });
}

function serializeFilterContextKey(ctx: DirectoryFilterRequestContext): string {
  const ff = [...(ctx.fieldFacets ?? [])]
    .map((f) => ({
      k: f.fieldKey.trim(),
      v: [...new Set(f.values.map((x) => x.trim()).filter(Boolean))].sort(),
    }))
    .filter((x) => x.k && x.v.length)
    .sort((a, b) => a.k.localeCompare(b.k));
  return JSON.stringify({
    t: [...ctx.taxonomyTermIds].sort(),
    l: (ctx.locationSlug ?? "").trim(),
    a: ctx.heightMinCm ?? null,
    b: ctx.heightMaxCm ?? null,
    q: (ctx.query ?? "").trim(),
    ff,
  });
}

function sanitizeSearchForRpc(q: string): string {
  return q.trim().replaceAll("%", "").replaceAll("_", "").trim();
}

function textEnumOptionsFromConfigRow(row: FieldDefinitionQueryRow): string[] | null {
  // Prefer explicit filter_options (set by admin for directory filtering).
  const filterOpts = row.config?.filter_options;
  if (Array.isArray(filterOpts)) {
    const out = filterOpts
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
    if (out.length) return out;
  }
  // Fall back to config.options[].value — the form-select format used by fields like
  // hair_color, body_type, eye_color, experience_level, etc.
  const opts = row.config?.options;
  if (Array.isArray(opts)) {
    const out = opts
      .filter(
        (o): o is { value: string } =>
          o !== null && typeof o === "object" && typeof (o as { value?: unknown }).value === "string" && (o as { value: string }).value.trim().length > 0,
      )
      .map((o) => (o as { value: string }).value.trim());
    if (out.length) return out;
  }
  return null;
}

function parseBoolFacetValues(values: string[]): boolean[] {
  const out = new Set<boolean>();
  for (const v of values) {
    const t = v.trim().toLowerCase();
    if (t === "true" || t === "1" || t === "yes") out.add(true);
    else if (t === "false" || t === "0" || t === "no") out.add(false);
  }
  return [...out];
}

function buildRpcScalarFilters(
  fieldFacets: DirectoryFieldFacetSelection[] | undefined,
  catalogRows: FieldDefinitionQueryRow[],
  exclude: { omitGender?: boolean; omitBooleanDefId?: string; omitTextDefId?: string },
): {
  genderKeys: string[];
  booleanPayload: { id: string; v: boolean[] }[];
  textPayload: { id: string; v: string[] }[];
} {
  const keyToRow = new Map(catalogRows.map((r) => [r.key, r]));
  const genderKeys: string[] = [];
  const booleanPayload: { id: string; v: boolean[] }[] = [];
  const textPayload: { id: string; v: string[] }[] = [];

  for (const facet of fieldFacets ?? []) {
    const row = keyToRow.get(facet.fieldKey);
    const id = row?.id;
    if (!row || !id) continue;
    const vt = row.value_type;
    const opts = textEnumOptionsFromConfigRow(row);

    if (
      facet.fieldKey === DIRECTORY_CANONICAL_GENDER_FIELD_KEY &&
      (vt === "text" || vt === "textarea") &&
      opts?.length &&
      !exclude.omitGender
    ) {
      const allowed = new Set(opts);
      for (const v of facet.values) {
        if (allowed.has(v)) genderKeys.push(v);
      }
      continue;
    }

    if (vt === "boolean" && exclude.omitBooleanDefId !== id) {
      const bs = parseBoolFacetValues(facet.values);
      if (bs.length) booleanPayload.push({ id, v: bs });
      continue;
    }

    if (
      (vt === "text" || vt === "textarea") &&
      opts?.length &&
      facet.fieldKey !== DIRECTORY_CANONICAL_GENDER_FIELD_KEY &&
      exclude.omitTextDefId !== id
    ) {
      const allowed = new Set(opts);
      const vs = facet.values.filter((x) => allowed.has(x));
      if (vs.length) textPayload.push({ id, v: vs });
    }
  }

  return { genderKeys, booleanPayload, textPayload };
}

type FacetTaxRow = { taxonomy_term_id: string; profile_count: number | string };
type FacetLocRow = { city_slug: string; profile_count: number | string };

async function rpcFacetTaxonomy(
  supabase: SupabaseClient,
  args: {
    p_kind: string;
    p_location_city_slug: string | null;
    p_height_min: number | null;
    p_height_max: number | null;
    p_selected_taxonomy_ids: string[];
    p_search: string | null;
  },
): Promise<FacetTaxRow[] | null> {
  const { data, error } = await supabase.rpc("directory_facet_taxonomy_counts_for_kind", {
    p_kind: args.p_kind,
    p_location_city_slug: args.p_location_city_slug,
    p_height_min: args.p_height_min,
    p_height_max: args.p_height_max,
    p_selected_taxonomy_ids: args.p_selected_taxonomy_ids,
    p_search: args.p_search,
  });
  if (error) {
    if (isPostgrestMissingColumnError(error)) {
      console.warn(
        "[directory/facet-taxonomy-rpc] PostgREST has no matching RPC (migration likely not applied). Run migration 20260411220000_directory_facet_count_rpcs.sql against this project, then reload the API schema if needed.",
      );
    } else {
      logServerError("directory/facet-taxonomy-rpc", error);
    }
    return null;
  }
  return (data ?? []) as FacetTaxRow[];
}

async function rpcFacetLocation(
  supabase: SupabaseClient,
  args: {
    p_height_min: number | null;
    p_height_max: number | null;
    p_selected_taxonomy_ids: string[];
    p_search: string | null;
  },
): Promise<FacetLocRow[] | null> {
  const { data, error } = await supabase.rpc("directory_facet_location_counts", {
    p_height_min: args.p_height_min,
    p_height_max: args.p_height_max,
    p_selected_taxonomy_ids: args.p_selected_taxonomy_ids,
    p_search: args.p_search,
  });
  if (error) {
    if (isPostgrestMissingColumnError(error)) {
      console.warn(
        "[directory/facet-location-rpc] PostgREST has no matching RPC (migration likely not applied). Run migration 20260411220000_directory_facet_count_rpcs.sql against this project, then reload the API schema if needed.",
      );
    } else {
      logServerError("directory/facet-location-rpc", error);
    }
    return null;
  }
  return (data ?? []) as FacetLocRow[];
}

type FacetGenderRow = { gender_value: string; profile_count: number | string };
type FacetBoolRow = { value_bool: boolean; profile_count: number | string };
type FacetTextRow = { value_text: string; profile_count: number | string };

async function rpcFacetGenderCounts(
  supabase: SupabaseClient,
  args: {
    p_location_city_slug: string | null;
    p_height_min: number | null;
    p_height_max: number | null;
    p_selected_taxonomy_ids: string[];
    p_search: string | null;
    p_boolean_filters: unknown;
    p_text_filters: unknown;
  },
): Promise<FacetGenderRow[] | null> {
  const { data, error } = await supabase.rpc("directory_facet_gender_value_counts", {
    p_location_city_slug: args.p_location_city_slug,
    p_height_min: args.p_height_min,
    p_height_max: args.p_height_max,
    p_selected_taxonomy_ids: args.p_selected_taxonomy_ids,
    p_search: args.p_search,
    p_boolean_filters: args.p_boolean_filters,
    p_text_filters: args.p_text_filters,
  });
  if (error) {
    if (isPostgrestMissingColumnError(error)) {
      console.warn(
        "[directory/facet-gender-rpc] Missing RPC directory_facet_gender_value_counts (apply migration 20260413180000_directory_scalar_facet_counts.sql).",
      );
    } else {
      logServerError("directory/facet-gender-rpc", error);
    }
    return null;
  }
  return (data ?? []) as FacetGenderRow[];
}

async function rpcFacetBooleanFieldCounts(
  supabase: SupabaseClient,
  args: {
    p_field_definition_id: string;
    p_location_city_slug: string | null;
    p_height_min: number | null;
    p_height_max: number | null;
    p_selected_taxonomy_ids: string[];
    p_search: string | null;
    p_gender_filter: string[];
    p_boolean_filters: unknown;
    p_text_filters: unknown;
  },
): Promise<FacetBoolRow[] | null> {
  const { data, error } = await supabase.rpc("directory_facet_boolean_field_value_counts", {
    p_field_definition_id: args.p_field_definition_id,
    p_location_city_slug: args.p_location_city_slug,
    p_height_min: args.p_height_min,
    p_height_max: args.p_height_max,
    p_selected_taxonomy_ids: args.p_selected_taxonomy_ids,
    p_search: args.p_search,
    p_gender_filter: args.p_gender_filter,
    p_boolean_filters: args.p_boolean_filters,
    p_text_filters: args.p_text_filters,
  });
  if (error) {
    if (isPostgrestMissingColumnError(error)) {
      console.warn(
        "[directory/facet-boolean-rpc] Missing RPC directory_facet_boolean_field_value_counts (apply migration 20260413180000_directory_scalar_facet_counts.sql).",
      );
    } else {
      logServerError("directory/facet-boolean-rpc", error);
    }
    return null;
  }
  return (data ?? []) as FacetBoolRow[];
}

async function rpcFacetTextFieldCounts(
  supabase: SupabaseClient,
  args: {
    p_field_definition_id: string;
    p_location_city_slug: string | null;
    p_height_min: number | null;
    p_height_max: number | null;
    p_selected_taxonomy_ids: string[];
    p_search: string | null;
    p_gender_filter: string[];
    p_boolean_filters: unknown;
    p_text_filters: unknown;
  },
): Promise<FacetTextRow[] | null> {
  const { data, error } = await supabase.rpc("directory_facet_text_field_value_counts", {
    p_field_definition_id: args.p_field_definition_id,
    p_location_city_slug: args.p_location_city_slug,
    p_height_min: args.p_height_min,
    p_height_max: args.p_height_max,
    p_selected_taxonomy_ids: args.p_selected_taxonomy_ids,
    p_search: args.p_search,
    p_gender_filter: args.p_gender_filter,
    p_boolean_filters: args.p_boolean_filters,
    p_text_filters: args.p_text_filters,
  });
  if (error) {
    if (isPostgrestMissingColumnError(error)) {
      console.warn(
        "[directory/facet-text-rpc] Missing RPC directory_facet_text_field_value_counts (apply migration 20260413180000_directory_scalar_facet_counts.sql).",
      );
    } else {
      logServerError("directory/facet-text-rpc", error);
    }
    return null;
  }
  return (data ?? []) as FacetTextRow[];
}

function toBigIntCount(v: number | string): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildDirectoryFilterBlocks(
  sections: DirectoryFilterSection[],
  layout: DirectorySidebarLayoutRow,
): DirectoryFilterSidebarBlock[] {
  const byKey = new Map(sections.map((s) => [s.fieldKey, s]));
  const facetKeys = sections.map((s) => s.fieldKey);
  let order = mergeSidebarItemOrder(layout.item_order, facetKeys);
  if (!layout.filter_option_search_visible) {
    order = order.filter((k) => k !== DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY);
  } else if (!order.includes(DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY)) {
    order = [DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY, ...order];
  }
  const blocks: DirectoryFilterSidebarBlock[] = [];
  for (const key of order) {
    if (key === DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY) {
      blocks.push({ kind: "filter_search" });
      continue;
    }
    // Respect per-field visibility overrides set on the admin Filters page.
    // Missing key = visible by default; explicit false = hidden from public sidebar.
    if (layout.field_visibility_overrides[key] === false) continue;
    const s = byKey.get(key);
    if (s) {
      const defaultCollapsed = layout.section_collapsed_defaults[key] === true;
      blocks.push({ kind: "section", section: s, defaultCollapsed });
    }
  }
  return blocks;
}

async function loadDirectoryFilterSectionsUncached(
  locale: string,
  ctx: DirectoryFilterRequestContext,
  tenantId: string | null,
): Promise<DirectoryFilterSidebarModel> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) return { blocks: [] };

  const heightCatalog = await getCachedDirectoryHeightFilterConfig();
  const { minCm: hMinRpc, maxCm: hMaxRpc } = clampHeightRangeToCatalog(
    ctx.heightMinCm ?? null,
    ctx.heightMaxCm ?? null,
    heightCatalog,
  );
  const heightActive = heightCatalog.enabled && (hMinRpc != null || hMaxRpc != null);
  const rpcHeightMin = heightActive ? hMinRpc : null;
  const rpcHeightMax = heightActive ? hMaxRpc : null;

  const searchRpc = sanitizeSearchForRpc(ctx.query);
  const searchParam = searchRpc.length > 0 ? searchRpc : null;
  const locSlug = ctx.locationSlug.trim() || null;
  const t = createTranslator(locale);

  let fieldRows = await fetchDirectoryFilterCatalogRows(supabase, tenantId);

  if (!fieldRows.length) {
    const service = createServiceRoleClient();
    if (service) {
      const svcRows = await fetchDirectoryFilterCatalogRows(service, tenantId);
      if (svcRows.length) {
        logServerError(
          "directory/filter-sections/catalog_anon_blocked",
          new Error(
            "Anon key cannot read field_definitions catalog. Using service-role fallback.",
          ),
        );
        fieldRows = svcRows;
      }
    }
  }

  if (!fieldRows.length) return { blocks: [] };

  const catalogRows = (fieldRows as FieldDefinitionQueryRow[])
    .slice()
    .sort(compareFieldCatalogOrder);

  const toDefRow = (r: FieldDefinitionQueryRow): FieldDefinitionRow => ({
    key: r.key,
    label_en: r.label_en,
    label_es: r.label_es,
    value_type: r.value_type,
    filterable: r.filterable,
    directory_filter_visible: r.directory_filter_visible,
    active: r.active,
    archived_at: r.archived_at,
    taxonomy_kind: r.taxonomy_kind,
    sort_order: r.sort_order,
  });

  const taxonomyKinds = [
    ...new Set(
      catalogRows
        .map(toDefRow)
        .filter((f) => supportedValueType(f.value_type))
        .filter((f) => {
          if (f.value_type === "taxonomy_single" || f.value_type === "taxonomy_multi") {
            if (!f.taxonomy_kind) return false;
            if (f.taxonomy_kind === "location_city" || f.taxonomy_kind === "location_country")
              return false;
          }
          return true;
        })
        .filter((f) => f.value_type.startsWith("taxonomy"))
        .map((f) => f.taxonomy_kind!)
        .filter(Boolean),
    ),
  ];

  type TaxonomyTermRow = {
    id: string;
    kind: string;
    name_en: string;
    name_es: string | null;
    sort_order: number;
  };
  type LocationRow = {
    id: string;
    city_slug: string;
    display_name_en: string;
    display_name_es: string | null;
    country_code: string;
  };

  const [taxonomyRes, locationsRes] = await Promise.all([
    taxonomyKinds.length > 0
      ? supabase
          .from("taxonomy_terms")
          .select("id, kind, name_en, name_es, sort_order, slug")
          .in("kind", taxonomyKinds)
          .is("archived_at", null)
          .order("kind")
          .order("sort_order")
          .order("slug")
      : Promise.resolve({ data: [] as TaxonomyTermRow[], error: null }),
    supabase
      .from("locations")
      .select("id, city_slug, display_name_en, display_name_es, country_code")
      .is("archived_at", null)
      .order("display_name_en"),
  ]);

  if (taxonomyRes.error) {
    logServerError("directory/filter-sections/taxonomy_terms", taxonomyRes.error);
    return { blocks: [] };
  }
  if (locationsRes.error) {
    logServerError("directory/filter-sections/locations", locationsRes.error);
    return { blocks: [] };
  }

  const taxonomyByKind = new Map<string, { id: string; label: string }[]>();
  for (const row of (taxonomyRes.data ?? []) as TaxonomyTermRow[]) {
    const list = taxonomyByKind.get(row.kind) ?? [];
    list.push({
      id: row.id,
      label: pickLabel(locale, row.name_en, row.name_es),
    });
    taxonomyByKind.set(row.kind, list);
  }

  const locationOptions: DirectoryFilterOption[] = ((locationsRes.data ?? []) as LocationRow[]).map((l) => {
    const city = pickLabel(locale, l.display_name_en, l.display_name_es);
    const cc = String(l.country_code ?? "").trim();
    return { id: String(l.city_slug), label: cc ? `${city}, ${cc}` : city };
  });

  const sections: DirectoryFilterSection[] = [];
  let heightSectionInserted = false;

  for (const raw of catalogRows) {
    const f = toDefRow(raw);

    if (raw.key === "height_cm" && heightCatalog.enabled) {
      sections.push({
        fieldKey: "height_cm",
        label: pickLabel(locale, heightCatalog.labelEn, heightCatalog.labelEs),
        kind: "height_range",
        presentation: "height_range",
        sliderMinCm: heightCatalog.sliderMinCm,
        sliderMaxCm: heightCatalog.sliderMaxCm,
      });
      heightSectionInserted = true;
      continue;
    }

    if (raw.key === "date_of_birth" && f.value_type === "date") {
      sections.push({
        fieldKey: "date_of_birth",
        label: pickLabel(locale, f.label_en, f.label_es),
        kind: "age_range",
        presentation: "age_range",
        sliderMinAge: 18,
        sliderMaxAge: 70,
      });
      continue;
    }

    const enumOpts = textEnumOptionsFromConfigRow(raw);
    const defId = raw.id?.trim();

    if (
      defId &&
      f.key === DIRECTORY_CANONICAL_GENDER_FIELD_KEY &&
      (f.value_type === "text" || f.value_type === "textarea") &&
      enumOpts?.length
    ) {
      sections.push({
        fieldKey: f.key,
        fieldDefinitionId: defId,
        label: pickLabel(locale, f.label_en, f.label_es),
        kind: "profile_gender",
        presentation: "chips",
        options: enumOpts.map((label) => ({ id: label, label })),
      });
      continue;
    }

    if (defId && f.value_type === "boolean") {
      sections.push({
        fieldKey: f.key,
        fieldDefinitionId: defId,
        label: pickLabel(locale, f.label_en, f.label_es),
        kind: "field_boolean",
        presentation: "chips",
        options: [
          { id: "true", label: locale === "es" ? "Sí" : "Yes" },
          { id: "false", label: locale === "es" ? "No" : "No" },
        ],
      });
      continue;
    }

    if (
      defId &&
      (f.value_type === "text" || f.value_type === "textarea") &&
      enumOpts?.length &&
      f.key !== DIRECTORY_CANONICAL_GENDER_FIELD_KEY
    ) {
      sections.push({
        fieldKey: f.key,
        fieldDefinitionId: defId,
        label: pickLabel(locale, f.label_en, f.label_es),
        kind: "field_text_enum",
        presentation: enumOpts.length <= 6 ? "chips" : "radio",
        options: enumOpts.map((label) => ({ id: label, label })),
      });
      continue;
    }

    if (!supportedValueType(f.value_type)) continue;
    if (f.value_type === "taxonomy_single" || f.value_type === "taxonomy_multi") {
      if (!f.taxonomy_kind) continue;
      if (f.taxonomy_kind === "location_city" || f.taxonomy_kind === "location_country") continue;
    }

    if (f.value_type === "location") {
      sections.push({
        fieldKey: f.key,
        label: t("public.directory.ui.filters.citySectionLabel"),
        kind: "location",
        presentation: "location",
        options: locationOptions,
      });
      continue;
    }
    const tk = f.taxonomy_kind!;
    const opts = taxonomyByKind.get(tk) ?? [];
    if (opts.length === 0) continue;
    sections.push({
      fieldKey: f.key,
      label: pickLabel(locale, f.label_en, f.label_es),
      kind: "taxonomy",
      taxonomyKind: tk,
      presentation: taxonomyPresentation(f),
      options: opts.map((o) => ({ ...o })),
    });
  }

  if (heightCatalog.enabled && !heightSectionInserted) {
    sections.push({
      fieldKey: "height_cm",
      label: pickLabel(locale, heightCatalog.labelEn, heightCatalog.labelEs),
      kind: "height_range",
      presentation: "height_range",
      sliderMinCm: heightCatalog.sliderMinCm,
      sliderMaxCm: heightCatalog.sliderMaxCm,
    });
  }

  const rpcClient = supabase;
  const taxArgsBase = {
    p_location_city_slug: locSlug,
    p_height_min: rpcHeightMin,
    p_height_max: rpcHeightMax,
    p_selected_taxonomy_ids: ctx.taxonomyTermIds,
    p_search: searchParam,
  };

  const taxRpcTasks = sections
    .filter((s): s is Extract<DirectoryFilterSection, { kind: "taxonomy" }> => s.kind === "taxonomy")
    .map(async (s) => {
      const rows = await rpcFacetTaxonomy(rpcClient, { ...taxArgsBase, p_kind: s.taxonomyKind });
      if (!rows) return;
      const byId = new Map(rows.map((r) => [r.taxonomy_term_id, toBigIntCount(r.profile_count)]));
      for (const opt of s.options) {
        opt.count = byId.get(opt.id) ?? 0;
      }
    });

  const locSection = sections.find((s) => s.kind === "location");
  const locTask = locSection
    ? (async () => {
        const rows = await rpcFacetLocation(rpcClient, {
          p_height_min: rpcHeightMin,
          p_height_max: rpcHeightMax,
          p_selected_taxonomy_ids: ctx.taxonomyTermIds,
          p_search: searchParam,
        });
        if (!rows) return;
        const bySlug = new Map(rows.map((r) => [r.city_slug, toBigIntCount(r.profile_count)]));
        for (const opt of locSection.options) {
          opt.count = bySlug.get(opt.id) ?? 0;
        }
      })()
    : Promise.resolve();

  const fieldFacets = ctx.fieldFacets ?? [];

  const genderSection = sections.find((s) => s.kind === "profile_gender");
  const genderTask = genderSection
    ? (async () => {
        const { booleanPayload, textPayload } = buildRpcScalarFilters(fieldFacets, catalogRows, {
          omitGender: true,
        });
        const rows = await rpcFacetGenderCounts(rpcClient, {
          ...taxArgsBase,
          p_boolean_filters: booleanPayload,
          p_text_filters: textPayload,
        });
        if (!rows || genderSection.kind !== "profile_gender") return;
        const byVal = new Map(rows.map((r) => [r.gender_value, toBigIntCount(r.profile_count)]));
        for (const opt of genderSection.options) {
          opt.count = byVal.get(opt.id) ?? 0;
        }
      })()
    : Promise.resolve();

  const boolTasks = sections
    .filter((s): s is Extract<DirectoryFilterSection, { kind: "field_boolean" }> => s.kind === "field_boolean")
    .map(async (s) => {
      const { genderKeys, booleanPayload, textPayload } = buildRpcScalarFilters(fieldFacets, catalogRows, {
        omitBooleanDefId: s.fieldDefinitionId,
      });
      const rows = await rpcFacetBooleanFieldCounts(rpcClient, {
        p_field_definition_id: s.fieldDefinitionId,
        ...taxArgsBase,
        p_gender_filter: genderKeys,
        p_boolean_filters: booleanPayload,
        p_text_filters: textPayload,
      });
      if (!rows) return;
      const by = new Map<boolean, number>();
      for (const r of rows) {
        by.set(r.value_bool, toBigIntCount(r.profile_count));
      }
      for (const opt of s.options) {
        const b = opt.id === "true";
        opt.count = by.get(b) ?? 0;
      }
    });

  const textEnumTasks = sections
    .filter((s): s is Extract<DirectoryFilterSection, { kind: "field_text_enum" }> => s.kind === "field_text_enum")
    .map(async (s) => {
      const { genderKeys, booleanPayload, textPayload } = buildRpcScalarFilters(fieldFacets, catalogRows, {
        omitTextDefId: s.fieldDefinitionId,
      });
      const rows = await rpcFacetTextFieldCounts(rpcClient, {
        p_field_definition_id: s.fieldDefinitionId,
        ...taxArgsBase,
        p_gender_filter: genderKeys,
        p_boolean_filters: booleanPayload,
        p_text_filters: textPayload,
      });
      if (!rows) return;
      const by = new Map(rows.map((r) => [r.value_text, toBigIntCount(r.profile_count)]));
      for (const opt of s.options) {
        opt.count = by.get(opt.id) ?? 0;
      }
    });

  await Promise.all([
    ...taxRpcTasks,
    locTask,
    genderTask,
    ...boolTasks,
    ...textEnumTasks,
  ]);

  const needsSvcRetry = sections.some((s) => {
    if (s.kind === "height_range" || s.kind === "age_range") return false;
    if (!("options" in s)) return false;
    return s.options.some((o) => o.count === undefined);
  });
  if (needsSvcRetry) {
    const svc = createServiceRoleClient();
    if (svc) {
      const retryTax = sections
        .filter((s): s is Extract<DirectoryFilterSection, { kind: "taxonomy" }> => s.kind === "taxonomy")
        .map(async (s) => {
          if (!s.options.some((o) => o.count === undefined)) return;
          const rows = await rpcFacetTaxonomy(svc, { ...taxArgsBase, p_kind: s.taxonomyKind });
          if (!rows) return;
          const byId = new Map(rows.map((r) => [r.taxonomy_term_id, toBigIntCount(r.profile_count)]));
          for (const opt of s.options) {
            if (opt.count === undefined) opt.count = byId.get(opt.id) ?? 0;
          }
        });
      const retryLoc =
        locSection &&
        locSection.options.some((o) => o.count === undefined) &&
        (async () => {
          const rows = await rpcFacetLocation(svc, {
            p_height_min: rpcHeightMin,
            p_height_max: rpcHeightMax,
            p_selected_taxonomy_ids: ctx.taxonomyTermIds,
            p_search: searchParam,
          });
          if (!rows || locSection.kind !== "location") return;
          const bySlug = new Map(rows.map((r) => [r.city_slug, toBigIntCount(r.profile_count)]));
          for (const opt of locSection.options) {
            if (opt.count === undefined) opt.count = bySlug.get(opt.id) ?? 0;
          }
        })();

      const retryGender =
        genderSection &&
        genderSection.kind === "profile_gender" &&
        genderSection.options.some((o) => o.count === undefined) &&
        (async () => {
          const { booleanPayload, textPayload } = buildRpcScalarFilters(fieldFacets, catalogRows, {
            omitGender: true,
          });
          const rows = await rpcFacetGenderCounts(svc, {
            ...taxArgsBase,
            p_boolean_filters: booleanPayload,
            p_text_filters: textPayload,
          });
          if (!rows) return;
          const byVal = new Map(rows.map((r) => [r.gender_value, toBigIntCount(r.profile_count)]));
          for (const opt of genderSection.options) {
            if (opt.count === undefined) opt.count = byVal.get(opt.id) ?? 0;
          }
        })();

      const retryBool = sections
        .filter((s): s is Extract<DirectoryFilterSection, { kind: "field_boolean" }> => s.kind === "field_boolean")
        .map(async (s) => {
          if (!s.options.some((o) => o.count === undefined)) return;
          const { genderKeys, booleanPayload, textPayload } = buildRpcScalarFilters(fieldFacets, catalogRows, {
            omitBooleanDefId: s.fieldDefinitionId,
          });
          const rows = await rpcFacetBooleanFieldCounts(svc, {
            p_field_definition_id: s.fieldDefinitionId,
            ...taxArgsBase,
            p_gender_filter: genderKeys,
            p_boolean_filters: booleanPayload,
            p_text_filters: textPayload,
          });
          if (!rows) return;
          const by = new Map<boolean, number>();
          for (const r of rows) {
            by.set(r.value_bool, toBigIntCount(r.profile_count));
          }
          for (const opt of s.options) {
            if (opt.count === undefined) {
              const b = opt.id === "true";
              opt.count = by.get(b) ?? 0;
            }
          }
        });

      const retryText = sections
        .filter((s): s is Extract<DirectoryFilterSection, { kind: "field_text_enum" }> => s.kind === "field_text_enum")
        .map(async (s) => {
          if (!s.options.some((o) => o.count === undefined)) return;
          const { genderKeys, booleanPayload, textPayload } = buildRpcScalarFilters(fieldFacets, catalogRows, {
            omitTextDefId: s.fieldDefinitionId,
          });
          const rows = await rpcFacetTextFieldCounts(svc, {
            p_field_definition_id: s.fieldDefinitionId,
            ...taxArgsBase,
            p_gender_filter: genderKeys,
            p_boolean_filters: booleanPayload,
            p_text_filters: textPayload,
          });
          if (!rows) return;
          const by = new Map(rows.map((r) => [r.value_text, toBigIntCount(r.profile_count)]));
          for (const opt of s.options) {
            if (opt.count === undefined) opt.count = by.get(opt.id) ?? 0;
          }
        });

      await Promise.all([
        ...retryTax,
        retryLoc ?? Promise.resolve(),
        retryGender ?? Promise.resolve(),
        ...retryBool,
        ...retryText,
      ]);
    }
  }

  const selectedTaxIds = new Set(ctx.taxonomyTermIds);
  const scalarSelected = new Map<string, Set<string>>();
  for (const facet of fieldFacets) {
    if (!facet.fieldKey.trim() || !facet.values.length) continue;
    const set = scalarSelected.get(facet.fieldKey) ?? new Set<string>();
    for (const v of facet.values) {
      if (v.trim()) set.add(v.trim());
    }
    scalarSelected.set(facet.fieldKey, set);
  }

  function stripZeroCountOptions(s: DirectoryFilterSection): DirectoryFilterSection {
    if (s.kind === "height_range" || s.kind === "age_range") return s;
    if (s.kind === "profile_gender" || s.kind === "field_boolean" || s.kind === "field_text_enum") {
      const sel = scalarSelected.get(s.fieldKey);
      return {
        ...s,
        options: s.options.filter(
          (o) => sel?.has(o.id) || typeof o.count !== "number" || o.count > 0,
        ),
      };
    }
    return {
      ...s,
      options: s.options.filter(
        (o) =>
          selectedTaxIds.has(o.id) || typeof o.count !== "number" || o.count > 0,
      ),
    };
  }

  const workingSections = sections.map(stripZeroCountOptions);

  const filteredSections = workingSections.filter((s) => {
    if (s.kind === "height_range" || s.kind === "age_range") return true;
    return s.options.length > 0;
  });

  const layout = await fetchDirectorySidebarLayout(supabase, tenantId);

  let topBarFacet: DirectoryTopBarFacetModel | undefined;
  const sidebarSections = [...filteredSections];
  const topKey = layout.top_bar_facet_key?.trim() ?? null;
  if (topKey) {
    const ti = sidebarSections.findIndex(
      (s) => s.kind === "taxonomy" && s.fieldKey === topKey && s.options.length > 0,
    );
    if (ti >= 0) {
      const sec = sidebarSections[ti] as Extract<
        DirectoryFilterSection,
        { kind: "taxonomy" }
      >;
      topBarFacet = {
        fieldKey: sec.fieldKey,
        label: sec.label,
        options: sec.options.map((o) => ({ ...o })),
      };
      sidebarSections.splice(ti, 1);
    }
  }

  return {
    blocks: buildDirectoryFilterBlocks(sidebarSections, layout),
    topBarFacet,
  };
}

export function getCachedDirectoryFilterSidebarModel(
  locale: string,
  ctx: DirectoryFilterRequestContext,
  surface: DirectorySurface,
) {
  const key = serializeFilterContextKey(ctx);
  const tenantId = tenantIdFromDirectorySurface(surface);
  const tenantKey = tenantId ?? "__hub__";
  return unstable_cache(
    () => loadDirectoryFilterSectionsUncached(locale, ctx, tenantId),
    ["directory-filter-sidebar", "v14-tenant-scoped", locale, tenantKey, key],
    { tags: [CACHE_TAG_DIRECTORY, CACHE_TAG_TAXONOMY], revalidate: 90 },
  )();
}

/** @deprecated Use getCachedDirectoryFilterSidebarModel — returns only facet sections in catalog order. */
export async function getCachedDirectoryFilterSections(
  locale: string,
  ctx: DirectoryFilterRequestContext,
  surface: DirectorySurface,
): Promise<DirectoryFilterSection[]> {
  const { blocks } = await getCachedDirectoryFilterSidebarModel(locale, ctx, surface);
  return blocks
    .filter((b): b is { kind: "section"; section: DirectoryFilterSection } => b.kind === "section")
    .map((b) => b.section);
}
