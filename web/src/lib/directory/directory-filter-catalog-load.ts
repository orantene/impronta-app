import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isResolvedFieldVisibleInDirectoryFilter,
  type PublicSurfaceContext,
} from "@/lib/field-engine/public-surface-visibility";
import { DIRECTORY_FILTER_CATALOG_REGISTRY } from "@/lib/field-engine/directory-field-catalog-registry";
import type { FieldDefinitionQueryRow } from "@/lib/directory/directory-filter-shared";

/** Project a frozen registry row into the `FieldDefinitionQueryRow` shape the
 *  rest of this module consumes. `field_groups.sort_order` carries the group
 *  order (the catalog comparator reads it); the legacy `directory_filter_visible`
 *  flag is synthesized `true` because the live gate is the canonical resolver
 *  (`isResolvedFieldVisibleInDirectoryFilter`), not this flag (Sub-Task 5). */
function registryRowToQueryRow(
  r: (typeof DIRECTORY_FILTER_CATALOG_REGISTRY)[number],
): FieldDefinitionQueryRow {
  return {
    id: r.id,
    key: r.key,
    label_en: r.label_en,
    label_es: r.label_es,
    value_type: r.value_type,
    filterable: r.filterable,
    directory_filter_visible: true,
    active: true,
    archived_at: null,
    taxonomy_kind: r.taxonomy_kind,
    sort_order: r.sort_order,
    config: r.config,
    field_group_id: null,
    field_groups: { sort_order: r.group_sort_order },
  };
}

/**
 * The directory FILTER catalog skeleton.
 *
 * T3.2b — repointed off legacy System A `field_definitions`. The row SKELETON
 * (key, labels, value_type, taxonomy_kind, sort_order, group order, option
 * config) is the FROZEN catalog registry captured 1:1 from prod; the per-tenant
 * `field_definitions.tenant_id` override leg is gone (0 prod override rows). The
 * live VISIBILITY gate stays canonical — every row is routed through
 * `isResolvedFieldVisibleInDirectoryFilter`, which reads
 * `profile_field_definitions` + `workspace_profile_field_settings` (so an admin
 * B-toggle still hides/shows a facet). The A-only keys (talent_type, location,
 * skills, the social-URL keys, display_name, the text `gender` chip) have no B
 * governance and are gated by the resolver's legacy-only allow-list — identical
 * to today.
 *
 * `supabase` is still passed for the resolver context (tenant-scoped override
 * lookup). The frozen rows are the canonical (`tenant_id IS NULL`) set, so the
 * result is byte-identical to the prior global+empty-tenant read.
 */
export async function fetchDirectoryFilterCatalogRows(
  supabase: SupabaseClient,
  tenantId: string | null,
): Promise<FieldDefinitionQueryRow[]> {
  const rows = DIRECTORY_FILTER_CATALOG_REGISTRY.map(registryRowToQueryRow);
  const ctx: PublicSurfaceContext = { supabase, tenantId };
  // Route every row through the unified resolver helper. It covers:
  //   - Bridged keys: canonical effectiveFieldVisibility ∧ show_in_directory_filter
  //   - Gender allow-list (R4) + the legacy-only filter chips (talent_type, location)
  //   - Tenant overrides via workspace_profile_field_settings
  const visible = await Promise.all(
    rows.map((row) =>
      isResolvedFieldVisibleInDirectoryFilter(
        {
          key: row.key,
          directory_filter_visible: row.directory_filter_visible ?? true,
          active: row.active,
          archived_at: row.archived_at,
          tenant_id: null,
        },
        ctx,
      ),
    ),
  );
  return rows.filter((_, i) => visible[i]);
}
