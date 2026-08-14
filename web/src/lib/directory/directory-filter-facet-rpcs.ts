import { improntaLog } from "@/lib/server/structured-log";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import type { DirectoryFieldFacetSelection } from "@/lib/directory/types";
import { DIRECTORY_CANONICAL_GENDER_FIELD_KEY } from "@/lib/directory/apply-directory-field-facet-filters";
import {
  textEnumOptionsFromConfigRow,
  type FieldDefinitionQueryRow,
} from "@/lib/directory/directory-filter-shared";

function parseBoolFacetValues(values: string[]): boolean[] {
  const out = new Set<boolean>();
  for (const v of values) {
    const t = v.trim().toLowerCase();
    if (t === "true" || t === "1" || t === "yes") out.add(true);
    else if (t === "false" || t === "0" || t === "no") out.add(false);
  }
  return [...out];
}

export function buildRpcScalarFilters(
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

export type FacetTaxRow = { taxonomy_term_id: string; profile_count: number | string };
export type FacetLocRow = { city_slug: string; profile_count: number | string };

export async function rpcFacetTaxonomy(
  supabase: SupabaseClient,
  args: {
    /**
     * Tenant whose roster the counts must be scoped to. When set, PostgREST
     * resolves the tenant-scoped overload (by argument names) so a storefront
     * counts ITS roster, not the whole platform. Null on the cross-tenant hub
     * directory, where platform-wide counts are the correct answer.
     */
    p_tenant_id?: string | null;
    p_kind: string;
    p_location_city_slug: string | null;
    p_height_min: number | null;
    p_height_max: number | null;
    p_selected_taxonomy_ids: string[];
    p_search: string | null;
  },
): Promise<FacetTaxRow[] | null> {
  const { data, error } = await supabase.rpc("directory_facet_taxonomy_counts_for_kind", {
    ...(args.p_tenant_id ? { p_tenant_id: args.p_tenant_id } : {}),
    p_kind: args.p_kind,
    p_location_city_slug: args.p_location_city_slug,
    p_height_min: args.p_height_min,
    p_height_max: args.p_height_max,
    p_selected_taxonomy_ids: args.p_selected_taxonomy_ids,
    p_search: args.p_search,
  });
  if (error) {
    if (isPostgrestMissingColumnError(error)) {
      void improntaLog("directory_field_driven_filters.warn", {
        message: "[directory/facet-taxonomy-rpc] PostgREST has no matching RPC (migration likely not applied). Run migration 20260411220000_directory_facet_count_rpcs.sql against this project, then reload the API schema if needed.",
      });
    } else {
      logServerError("directory/facet-taxonomy-rpc", error);
    }
    return null;
  }
  return (data ?? []) as FacetTaxRow[];
}

export async function rpcFacetLocation(
  supabase: SupabaseClient,
  args: {
    p_tenant_id: string | null;
    p_height_min: number | null;
    p_height_max: number | null;
    p_selected_taxonomy_ids: string[];
    p_search: string | null;
  },
): Promise<FacetLocRow[] | null> {
  // Tenant storefronts use the 5-arg overload (added 2026-06-27) which
  // restricts counts to the agency's active roster. Hub/marketing callers
  // pass tenant_id=null and hit the legacy 4-arg signature for cross-agency
  // aggregates.
  const rpcArgs = args.p_tenant_id
    ? {
        p_tenant_id: args.p_tenant_id,
        p_height_min: args.p_height_min,
        p_height_max: args.p_height_max,
        p_selected_taxonomy_ids: args.p_selected_taxonomy_ids,
        p_search: args.p_search,
      }
    : {
        p_height_min: args.p_height_min,
        p_height_max: args.p_height_max,
        p_selected_taxonomy_ids: args.p_selected_taxonomy_ids,
        p_search: args.p_search,
      };
  const { data, error } = await supabase.rpc(
    "directory_facet_location_counts",
    rpcArgs,
  );
  if (error) {
    if (isPostgrestMissingColumnError(error)) {
      void improntaLog("directory_field_driven_filters.warn", {
        message: "[directory/facet-location-rpc] PostgREST has no matching RPC (migration likely not applied). Run migration 20260411220000_directory_facet_count_rpcs.sql against this project, then reload the API schema if needed.",
      });
    } else {
      logServerError("directory/facet-location-rpc", error);
    }
    return null;
  }
  return (data ?? []) as FacetLocRow[];
}

export type FacetGenderRow = { gender_value: string; profile_count: number | string };
export type FacetBoolRow = { value_bool: boolean; profile_count: number | string };
export type FacetTextRow = { value_text: string; profile_count: number | string };

export async function rpcFacetGenderCounts(
  supabase: SupabaseClient,
  args: {
    /** Scope counts to this tenant's roster (see rpcFacetTaxonomy). */
    p_tenant_id?: string | null;
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
    ...(args.p_tenant_id ? { p_tenant_id: args.p_tenant_id } : {}),
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
      void improntaLog("directory_field_driven_filters.warn", {
        message: "[directory/facet-gender-rpc] Missing RPC directory_facet_gender_value_counts (apply migration 20260413180000_directory_scalar_facet_counts.sql).",
      });
    } else {
      logServerError("directory/facet-gender-rpc", error);
    }
    return null;
  }
  return (data ?? []) as FacetGenderRow[];
}

export async function rpcFacetBooleanFieldCounts(
  supabase: SupabaseClient,
  args: {
    /** Scope counts to this tenant's roster (see rpcFacetTaxonomy). */
    p_tenant_id?: string | null;
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
    ...(args.p_tenant_id ? { p_tenant_id: args.p_tenant_id } : {}),
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
      void improntaLog("directory_field_driven_filters.warn", {
        message: "[directory/facet-boolean-rpc] Missing RPC directory_facet_boolean_field_value_counts (apply migration 20260413180000_directory_scalar_facet_counts.sql).",
      });
    } else {
      logServerError("directory/facet-boolean-rpc", error);
    }
    return null;
  }
  return (data ?? []) as FacetBoolRow[];
}

export async function rpcFacetTextFieldCounts(
  supabase: SupabaseClient,
  args: {
    /** Scope counts to this tenant's roster (see rpcFacetTaxonomy). */
    p_tenant_id?: string | null;
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
    ...(args.p_tenant_id ? { p_tenant_id: args.p_tenant_id } : {}),
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
      void improntaLog("directory_field_driven_filters.warn", {
        message: "[directory/facet-text-rpc] Missing RPC directory_facet_text_field_value_counts (apply migration 20260413180000_directory_scalar_facet_counts.sql).",
      });
    } else {
      logServerError("directory/facet-text-rpc", error);
    }
    return null;
  }
  return (data ?? []) as FacetTextRow[];
}
