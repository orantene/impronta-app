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

export type DirectoryFilterPresentation = "chips" | "radio" | "grid" | "location" | "height_range";

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
    };

export type DirectoryFilterSidebarBlock =
  | { kind: "filter_search" }
  | { kind: "section"; section: DirectoryFilterSection; defaultCollapsed?: boolean };

/** Field key for the primary talent classification facet (`field_definitions.key`). */
export const DIRECTORY_TALENT_TYPE_FIELD_KEY = "talent_type" as const;

export type DirectoryTalentTypeTopBarModel = {
  fieldKey: string;
  label: string;
  options: DirectoryFilterOption[];
};

export type DirectoryFilterSidebarModel = {
  blocks: DirectoryFilterSidebarBlock[];
  /** Horizontal ALL + type pills; sidebar omits the same facet when present. */
  topBarTalentType?: DirectoryTalentTypeTopBarModel;
};

export type DirectoryFilterRequestContext = {
  taxonomyTermIds: string[];
  locationSlug: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  query: string;
};

type FieldDefinitionRow = {
  key: string;
  label_en: string;
  label_es: string | null;
  value_type: string;
  filterable: boolean;
  active: boolean;
  archived_at: string | null;
  taxonomy_kind: string | null;
  sort_order: number;
};

/** Loaded row includes group embed for ordering (matches admin Fields / talent dashboard). */
type FieldDefinitionQueryRow = FieldDefinitionRow & {
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

function pickLabel(locale: "en" | "es", en: string, es?: string | null): string {
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
  "key, label_en, label_es, value_type, filterable, active, archived_at, taxonomy_kind, sort_order, field_group_id, field_groups(sort_order)";

const DIRECTORY_FILTER_FIELD_DEF_SELECT =
  "key, label_en, label_es, value_type, filterable, directory_filter_visible, active, archived_at, taxonomy_kind, sort_order, field_group_id, field_groups(sort_order)";

function isMissingDirectoryFilterMigration(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("directory_filter_visible") || text.includes("directory_sidebar_layout");
}

async function fetchDirectoryFilterCatalogRows(supabase: SupabaseClient): Promise<FieldDefinitionQueryRow[]> {
  const modern = await supabase
    .from("field_definitions")
    .select(DIRECTORY_FILTER_FIELD_DEF_SELECT)
    .eq("directory_filter_visible", true)
    .eq("active", true)
    .is("archived_at", null);

  if (modern.error && isMissingDirectoryFilterMigration(modern.error)) {
    const legacy = await supabase
      .from("field_definitions")
      .select(FILTERABLE_FIELD_DEF_SELECT)
      .eq("filterable", true)
      .eq("active", true)
      .is("archived_at", null);
    if (legacy.error) {
      logServerError("directory/filter-sections/field_definitions_legacy", legacy.error);
      return [];
    }
    return (legacy.data ?? []) as FieldDefinitionQueryRow[];
  }

  if (modern.error) {
    logServerError("directory/filter-sections/field_definitions", modern.error);
    return [];
  }
  return (modern.data ?? []) as FieldDefinitionQueryRow[];
}

function serializeFilterContextKey(ctx: DirectoryFilterRequestContext): string {
  return JSON.stringify({
    t: [...ctx.taxonomyTermIds].sort(),
    l: (ctx.locationSlug ?? "").trim(),
    a: ctx.heightMinCm ?? null,
    b: ctx.heightMaxCm ?? null,
    q: (ctx.query ?? "").trim(),
  });
}

function sanitizeSearchForRpc(q: string): string {
  return q.trim().replaceAll("%", "").replaceAll("_", "").trim();
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
    const s = byKey.get(key);
    if (s) {
      const defaultCollapsed = layout.section_collapsed_defaults[key] === true;
      blocks.push({ kind: "section", section: s, defaultCollapsed });
    }
  }
  return blocks;
}

async function loadDirectoryFilterSectionsUncached(
  locale: "en" | "es",
  ctx: DirectoryFilterRequestContext,
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

  let fieldRows = await fetchDirectoryFilterCatalogRows(supabase);

  if (!fieldRows.length) {
    const service = createServiceRoleClient();
    if (service) {
      const svcRows = await fetchDirectoryFilterCatalogRows(service);
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

  await Promise.all([...taxRpcTasks, locTask]);

  const needsSvcRetry = sections.some(
    (s) =>
      (s.kind === "taxonomy" || s.kind === "location") && s.options.some((o) => o.count === undefined),
  );
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
      await Promise.all([...retryTax, retryLoc ?? Promise.resolve()]);
    }
  }

  const selectedTaxIds = new Set(ctx.taxonomyTermIds);

  function stripZeroCountOptions(s: DirectoryFilterSection): DirectoryFilterSection {
    if (s.kind === "height_range") return s;
    return {
      ...s,
      options: s.options.filter(
        (o) =>
          selectedTaxIds.has(o.id) || typeof o.count !== "number" || o.count > 0,
      ),
    };
  }

  let workingSections = sections.map(stripZeroCountOptions);

  const filteredSections = workingSections.filter((s) => {
    if (s.kind === "height_range") return true;
    return s.options.length > 0;
  });

  const layout = await fetchDirectorySidebarLayout(supabase);

  let topBarTalentType: DirectoryTalentTypeTopBarModel | undefined;
  const sidebarSections = [...filteredSections];
  if (layout.talent_type_top_bar_visible) {
    const ti = sidebarSections.findIndex(
      (s) =>
        s.kind === "taxonomy" &&
        s.fieldKey === DIRECTORY_TALENT_TYPE_FIELD_KEY &&
        s.options.length > 0,
    );
    if (ti >= 0) {
      const sec = sidebarSections[ti] as Extract<
        DirectoryFilterSection,
        { kind: "taxonomy" }
      >;
      topBarTalentType = {
        fieldKey: sec.fieldKey,
        label: sec.label,
        options: sec.options.map((o) => ({ ...o })),
      };
      sidebarSections.splice(ti, 1);
    }
  }

  return {
    blocks: buildDirectoryFilterBlocks(sidebarSections, layout),
    topBarTalentType,
  };
}

export function getCachedDirectoryFilterSidebarModel(
  locale: "en" | "es",
  ctx: DirectoryFilterRequestContext,
) {
  const key = serializeFilterContextKey(ctx);
  return unstable_cache(
    () => loadDirectoryFilterSectionsUncached(locale, ctx),
    ["directory-filter-sidebar", "v9-topbar-zerocount", locale, key],
    { tags: [CACHE_TAG_DIRECTORY, CACHE_TAG_TAXONOMY], revalidate: 90 },
  )();
}

/** @deprecated Use getCachedDirectoryFilterSidebarModel — returns only facet sections in catalog order. */
export async function getCachedDirectoryFilterSections(
  locale: "en" | "es",
  ctx: DirectoryFilterRequestContext,
): Promise<DirectoryFilterSection[]> {
  const { blocks } = await getCachedDirectoryFilterSidebarModel(locale, ctx);
  return blocks
    .filter((b): b is { kind: "section"; section: DirectoryFilterSection } => b.kind === "section")
    .map((b) => b.section);
}
