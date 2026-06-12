import type { DirectoryFieldFacetSelection } from "@/lib/directory/types";

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

export function tenantIdFromDirectorySurface(surface: DirectorySurface): string | null {
  return surface.kind === "agency" ? surface.tenantId : null;
}

export type FieldDefinitionRow = {
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
export type FieldDefinitionQueryRow = FieldDefinitionRow & {
  id?: string;
  config?: Record<string, unknown> | null;
  field_group_id?: string | null;
  field_groups?: { sort_order: number } | { sort_order: number }[] | null;
  /** T3.1 — the facet vocab from canonical System B
   *  (`directory_filter_config.filter_options`), overlaid onto the catalog row
   *  when the `directory_facets` flag is `b`. Preferred over the legacy A
   *  `config` vocab when present; absent = read A. */
  bFilterOptions?: string[] | null;
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

export function compareFieldCatalogOrder(a: FieldDefinitionQueryRow, b: FieldDefinitionQueryRow): number {
  const ga = groupSortFromEmbed(a.field_groups);
  const gb = groupSortFromEmbed(b.field_groups);
  if (ga !== gb) return ga - gb;
  const sa = a.sort_order ?? 0;
  const sb = b.sort_order ?? 0;
  if (sa !== sb) return sa - sb;
  return a.key.localeCompare(b.key);
}

export function pickLabel(locale: string, en: string, es?: string | null): string {
  if (locale === "es" && es && es.trim()) return es.trim();
  return en.trim();
}

export function supportedValueType(valueType: string): valueType is "taxonomy_single" | "taxonomy_multi" | "location" {
  return valueType === "taxonomy_single" || valueType === "taxonomy_multi" || valueType === "location";
}

export function taxonomyPresentation(f: FieldDefinitionRow): "radio" | "grid" | "chips" {
  if (f.value_type === "taxonomy_single") return "radio";
  if (f.taxonomy_kind === "language") return "grid";
  return "chips";
}

export function serializeFilterContextKey(ctx: DirectoryFilterRequestContext): string {
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

export function sanitizeSearchForRpc(q: string): string {
  return q.trim().replaceAll("%", "").replaceAll("_", "").trim();
}

export function textEnumOptionsFromConfigRow(row: FieldDefinitionQueryRow): string[] | null {
  // T3.1 — prefer the canonical System B vocab (`directory_filter_config.
  // filter_options`) when overlaid behind the `directory_facets` flag.
  if (row.bFilterOptions && row.bFilterOptions.length > 0) return row.bFilterOptions;
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

export function toBigIntCount(v: number | string): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
