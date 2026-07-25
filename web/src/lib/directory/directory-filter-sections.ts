import { unstable_cache } from "next/cache";
import { createTranslator } from "@/i18n/messages";
import { CACHE_TAG_DIRECTORY, CACHE_TAG_TAXONOMY } from "@/lib/cache-tags";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { fetchAllTaxonomyTerms } from "@/lib/supabase/paged";
import { logServerError } from "@/lib/server/safe-error";
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
import { DIRECTORY_CANONICAL_GENDER_FIELD_KEY } from "@/lib/directory/apply-directory-field-facet-filters";
import { loadDirectoryFacetConfigByLegacyKey } from "@/lib/field-engine/read-source-directory-facet-config";
import { loadTenantTaxonomyVisibility } from "@/lib/directory/taxonomy-tenant-safety";
import {
  compareFieldCatalogOrder,
  pickLabel,
  sanitizeSearchForRpc,
  serializeFilterContextKey,
  supportedValueType,
  taxonomyPresentation,
  tenantIdFromDirectorySurface,
  textEnumOptionsFromConfigRow,
  toBigIntCount,
  type DirectoryFilterOption,
  type DirectoryFilterRequestContext,
  type DirectoryFilterSection,
  type DirectoryFilterSidebarBlock,
  type DirectoryFilterSidebarModel,
  type DirectorySurface,
  type DirectoryTopBarFacetModel,
  type FieldDefinitionQueryRow,
  type FieldDefinitionRow,
} from "@/lib/directory/directory-filter-shared";
import { fetchDirectoryFilterCatalogRows } from "@/lib/directory/directory-filter-catalog-load";
import {
  buildRpcScalarFilters,
  rpcFacetBooleanFieldCounts,
  rpcFacetGenderCounts,
  rpcFacetLocation,
  rpcFacetTaxonomy,
  rpcFacetTextFieldCounts,
} from "@/lib/directory/directory-filter-facet-rpcs";

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

  // T3.2b: the catalog skeleton is the frozen registry (no anon-RLS hazard);
  // the resolver self-services its canonical reads with a service-role client.
  // Empty here means the canonical resolver hid every facet — a real state, not
  // an RLS block, so there is no service-role retry to do.
  const fieldRows = await fetchDirectoryFilterCatalogRows(supabase, tenantId);

  if (!fieldRows.length) return { blocks: [] };

  const catalogRows = (fieldRows as FieldDefinitionQueryRow[])
    .slice()
    .sort(compareFieldCatalogOrder);

  // T3.1 — overlay the facet vocab from canonical System B
  // (`directory_filter_config.filter_options`) behind the `directory_facets`
  // flag. Mutates the catalog rows in place so the section-building loop below
  // reads B's migrated vocab via `textEnumOptionsFromConfigRow`. Absent/throwing
  // B reads leave `bFilterOptions` unset → the A `config` vocab is used (today's
  // behaviour). Gender keeps its bare-label vocab (identical in A + B).
  const bFacetConfig = await loadDirectoryFacetConfigByLegacyKey(
    supabase,
    catalogRows.map((r) => r.key),
  );
  for (const row of catalogRows) {
    const cfg = bFacetConfig.get(row.key);
    if (cfg?.filterOptions && cfg.filterOptions.length > 0) {
      row.bFilterOptions = cfg.filterOptions;
    }
  }

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

  // taxonomy_terms.name_en/_es → name_i18n and locations.display_name_en/_es →
  // display_name_i18n (WS4 i18n migration); both read via the map below.
  type TaxonomyTermRow = {
    id: string;
    kind: string;
    name_i18n: Record<string, string | null> | null;
    sort_order: number;
    slug: string;
  };
  type LocationRow = {
    id: string;
    city_slug: string;
    display_name_i18n: Record<string, string | null> | null;
    country_code: string;
  };

  const [taxonomyRes, locationsRes] = await Promise.all([
    // `kind IN (taxonomyKinds) AND archived_at IS NULL` is ~900 rows today but
    // grows with talent_type (already 454) and can cross PostgREST's 1000-row
    // cap, which would silently drop facet options — directory-critical. Page by
    // `id`, then re-sort by the original display order (kind → sort_order →
    // slug) so the per-kind facet lists keep their order.
    taxonomyKinds.length > 0
      ? fetchAllTaxonomyTerms<TaxonomyTermRow>(
          supabase,
          "id, kind, name_i18n, sort_order, slug",
          (q) => q.in("kind", taxonomyKinds).is("archived_at", null),
        ).then(
          (rows) => ({
            data: rows
              .slice()
              .sort(
                (a, b) =>
                  (a.kind ?? "").localeCompare(b.kind ?? "") ||
                  (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
                  a.slug.localeCompare(b.slug),
              ),
            error: null as null,
          }),
          (error) => ({ data: null as TaxonomyTermRow[] | null, error }),
        )
      : Promise.resolve({ data: [] as TaxonomyTermRow[], error: null }),
    (async () => {
      // Tenant-scope the location facet options: show only cities where this
      // tenant has at least one approved/public talent. `directory_facet_
      // location_counts` RPC is tenant-blind today (counts everyone), so
      // without this pre-filter the sidebar listed other tenants' cities.
      if (!tenantId) {
        return supabase
          .from("locations")
          .select("id, city_slug, display_name_i18n, country_code")
          .is("archived_at", null)
          .order("display_name_i18n->>en");
      }
      const rosterRes = await supabase
        .from("agency_talent_roster")
        .select("talent_profile_id")
        .eq("tenant_id", tenantId)
        .eq("status", "active");
      const talentIds = ((rosterRes.data ?? []) as { talent_profile_id: string }[])
        .map((r) => r.talent_profile_id)
        .filter(Boolean);
      if (!talentIds.length) {
        return { data: [] as LocationRow[], error: null as null };
      }
      const profRes = await supabase
        .from("talent_profiles")
        .select("residence_city_id, location_id")
        .in("id", talentIds)
        .eq("workflow_status", "approved")
        .eq("visibility", "public")
        .is("deleted_at", null);
      const cityIdSet = new Set<string>();
      for (const r of (profRes.data ?? []) as {
        residence_city_id: string | null;
        location_id: string | null;
      }[]) {
        if (r.residence_city_id) cityIdSet.add(r.residence_city_id);
        if (r.location_id) cityIdSet.add(r.location_id);
      }
      if (!cityIdSet.size) {
        return { data: [] as LocationRow[], error: null as null };
      }
      return supabase
        .from("locations")
        .select("id, city_slug, display_name_i18n, country_code")
        .is("archived_at", null)
        .in("id", [...cityIdSet])
        .order("display_name_i18n->>en");
    })(),
  ]);

  if (taxonomyRes.error) {
    logServerError("directory/filter-sections/taxonomy_terms", taxonomyRes.error);
    return { blocks: [] };
  }
  if (locationsRes.error) {
    logServerError("directory/filter-sections/locations", locationsRes.error);
    return { blocks: [] };
  }

  // Tenant category overrides — a term the tenant disabled must not be offered
  // as a sidebar facet option (clicking it would return nobody anyway, since
  // `resolveTenantSafeDirectoryTaxonomyTermIds` strips it from `?tax=`).
  const taxonomyVisibility = await loadTenantTaxonomyVisibility(supabase, tenantId);

  const taxonomyByKind = new Map<string, { id: string; label: string }[]>();
  for (const row of (taxonomyRes.data ?? []) as TaxonomyTermRow[]) {
    if (!taxonomyVisibility.isTermVisible(row.id)) continue;
    const list = taxonomyByKind.get(row.kind) ?? [];
    list.push({
      id: row.id,
      label: pickLabel(locale, row.name_i18n?.en ?? "", row.name_i18n?.es ?? null),
    });
    taxonomyByKind.set(row.kind, list);
  }

  const locationOptions: DirectoryFilterOption[] = ((locationsRes.data ?? []) as LocationRow[]).map((l) => {
    const city = pickLabel(locale, l.display_name_i18n?.en ?? "", l.display_name_i18n?.es ?? null);
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
          { id: "true", label: pickLocale(locale, { en: "Yes", es: "Sí" }) },
          { id: "false", label: pickLocale(locale, { en: "No", es: "No" }) },
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
          p_tenant_id: tenantId,
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
            p_tenant_id: tenantId,
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
    ["directory-filter-sidebar", "v15-b-facet-config", locale, tenantKey, key],
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
