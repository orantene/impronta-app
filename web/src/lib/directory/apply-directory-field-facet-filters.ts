import type { SupabaseClient } from "@supabase/supabase-js";
import type { DirectoryFieldFacetSelection } from "@/lib/directory/types";
import {
  isResolvedFieldVisibleInDirectoryFilter,
  type PublicSurfaceContext,
} from "@/lib/field-engine/public-surface-visibility";
import { fetchDirectoryFacetTalentIds } from "@/lib/field-engine/read-source-directory-facets";
import { loadDirectoryFacetConfigByLegacyKey } from "@/lib/field-engine/read-source-directory-facet-config";

/** Canonical `talent_profiles.gender` — filtered via column, not `field_values`. */
export const DIRECTORY_CANONICAL_GENDER_FIELD_KEY = "gender";

const ID_CHUNK = 450;

export type DirectoryFacetDefinitionRow = {
  id: string;
  key: string;
  value_type: string;
  filterable: boolean;
  directory_filter_visible?: boolean | null;
  config: Record<string, unknown> | null;
  /** T3.1 — the facet's `filter_options` vocab as read from canonical System B
   *  (`profile_field_definitions.directory_filter_config`). Populated by
   *  `loadDirectoryFacetDefinitionsByKey` when the `directory_facets` flag is `b`;
   *  preferred over the legacy A `config` vocab when present. Absent = read A. */
  bFilterOptions?: string[] | null;
};

function filterOptionsFromConfig(
  config: Record<string, unknown> | null | undefined,
): string[] | null {
  const raw = config?.filter_options;
  if (Array.isArray(raw)) {
    const out = raw
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
    if (out.length) return out;
  }

  const optionRows = config?.options;
  if (!Array.isArray(optionRows)) return null;
  const out = optionRows
    .filter(
      (x): x is { value: string } =>
        x !== null &&
        typeof x === "object" &&
        typeof (x as { value?: unknown }).value === "string" &&
        (x as { value: string }).value.trim().length > 0,
    )
    .map((x) => x.value.trim());
  return out.length ? out : null;
}

/** The facet's selectable vocab — System B `directory_filter_config.filter_options`
 *  when present (the migrated home), else the legacy A `config` vocab. This is the
 *  single resolver the apply step uses so config flips with the `directory_facets`
 *  flag without changing the call sites' validation semantics. */
export function resolveFacetFilterOptions(
  def: DirectoryFacetDefinitionRow,
): string[] | null {
  if (def.bFilterOptions && def.bFilterOptions.length > 0) return def.bFilterOptions;
  return filterOptionsFromConfig(def.config);
}

export function isDirectoryFacetEligibleDef(row: DirectoryFacetDefinitionRow): boolean {
  if (row.directory_filter_visible === true) return true;
  if (row.directory_filter_visible === false) return false;
  return Boolean(row.filterable);
}

function parseBooleanFacetValues(values: string[]): boolean[] {
  const out = new Set<boolean>();
  for (const v of values) {
    const t = v.trim().toLowerCase();
    if (t === "true" || t === "1" || t === "yes") out.add(true);
    else if (t === "false" || t === "0" || t === "no") out.add(false);
  }
  return [...out];
}

// The facet VALUE-store read (`field_values` for A / `talent_profile_field_values`
// for B) now lives behind the field-engine read seam:
// `fetchDirectoryFacetTalentIds` in read-source-directory-facets.ts. The legacy
// A-reader is lifted there verbatim as `readA`; the `directory_facets` flag (and
// safe-fallback-to-A on a B throw) governs which store this query hits. Gender +
// height are NOT routed through it — they read indexed `talent_profiles` columns.

async function fetchGenderProfileIds(
  supabase: SupabaseClient,
  genderValues: string[],
  args: {
    locationId: string | null;
    heightFilterActive: boolean;
    heightMinApplied: number | null;
    heightMaxApplied: number | null;
    orResidenceOrLegacyLocationEq: (locationId: string) => string;
    constrainedTalentIds: string[] | null;
  },
): Promise<string[]> {
  const acc = new Set<string>();

  const runBatch = async (idChunk: string[] | null) => {
    let q = supabase
      .from("talent_profiles")
      .select("id")
      .is("deleted_at", null)
      .eq("workflow_status", "approved")
      .eq("visibility", "public")
      .in("gender", genderValues);
    if (args.locationId) {
      q = q.or(args.orResidenceOrLegacyLocationEq(args.locationId));
    }
    if (args.heightFilterActive) {
      if (args.heightMinApplied != null) q = q.gte("height_cm", args.heightMinApplied);
      if (args.heightMaxApplied != null) q = q.lte("height_cm", args.heightMaxApplied);
    }
    if (idChunk) {
      if (idChunk.length === 0) return;
      q = q.in("id", idChunk);
    }
    const { data, error } = await q;
    if (error) throw new Error(`[directory] gender facet: ${error.message}`);
    for (const row of (data ?? []) as { id: string }[]) {
      acc.add(row.id);
    }
  };

  if (args.constrainedTalentIds === null) {
    await runBatch(null);
  } else if (args.constrainedTalentIds.length === 0) {
    return [];
  } else {
    for (let i = 0; i < args.constrainedTalentIds.length; i += ID_CHUNK) {
      await runBatch(args.constrainedTalentIds.slice(i, i + ID_CHUNK));
    }
  }
  return [...acc];
}

/**
 * ANDs scalar `ff` facets onto `filteredTalentIds` (null = no id constraint yet).
 */
export async function applyDirectoryFieldFacetFilters(
  supabase: SupabaseClient,
  selections: DirectoryFieldFacetSelection[],
  defsByKey: Map<string, DirectoryFacetDefinitionRow>,
  args: {
    locationId: string | null;
    heightFilterActive: boolean;
    heightMinApplied: number | null;
    heightMaxApplied: number | null;
    orResidenceOrLegacyLocationEq: (locationId: string) => string;
    filteredTalentIds: string[] | null;
  },
): Promise<{ filteredTalentIds: string[] | null; isEmpty: boolean }> {
  if (!selections.length) {
    return { filteredTalentIds: args.filteredTalentIds, isEmpty: false };
  }

  let ids = args.filteredTalentIds;
  const ordered = [...selections].sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));

  for (const sel of ordered) {
    const def = defsByKey.get(sel.fieldKey);
    if (!def || !isDirectoryFacetEligibleDef(def)) continue;
    const values = [...new Set(sel.values.map((v) => v.trim()).filter(Boolean))];
    if (values.length === 0) continue;

    const isCanonicalGender =
      def.key === DIRECTORY_CANONICAL_GENDER_FIELD_KEY &&
      (def.value_type === "text" || def.value_type === "textarea") &&
      resolveFacetFilterOptions(def) != null;

    if (isCanonicalGender) {
      const allowed = new Set(resolveFacetFilterOptions(def) ?? []);
      const gVals = values.filter((v) => allowed.has(v));
      if (gVals.length === 0) continue;
      const next = await fetchGenderProfileIds(supabase, gVals, {
        locationId: args.locationId,
        heightFilterActive: args.heightFilterActive,
        heightMinApplied: args.heightMinApplied,
        heightMaxApplied: args.heightMaxApplied,
        orResidenceOrLegacyLocationEq: args.orResidenceOrLegacyLocationEq,
        constrainedTalentIds: ids,
      });
      if (next.length === 0) return { filteredTalentIds: [], isEmpty: true };
      ids = next;
      continue;
    }

    if (def.value_type === "boolean") {
      const bools = parseBooleanFacetValues(values);
      if (bools.length === 0) continue;
      const next = await fetchDirectoryFacetTalentIds(
        supabase,
        { fieldKey: def.key, aFieldDefinitionId: def.id },
        { kind: "boolean", values: bools },
        ids,
      );
      if (next.length === 0) return { filteredTalentIds: [], isEmpty: true };
      ids = next;
      continue;
    }

    if (def.value_type === "text" || def.value_type === "textarea") {
      const opts = resolveFacetFilterOptions(def);
      if (!opts) continue;
      const allowed = new Set(opts);
      const tVals = values.filter((v) => allowed.has(v));
      if (tVals.length === 0) continue;
      const next = await fetchDirectoryFacetTalentIds(
        supabase,
        { fieldKey: def.key, aFieldDefinitionId: def.id },
        { kind: "text", values: tVals },
        ids,
      );
      if (next.length === 0) return { filteredTalentIds: [], isEmpty: true };
      ids = next;
      continue;
    }
  }

  return { filteredTalentIds: ids, isEmpty: false };
}

export async function loadDirectoryFacetDefinitionsByKey(
  supabase: SupabaseClient,
  keys: string[],
  opts: { tenantId?: string | null } = {},
): Promise<Map<string, DirectoryFacetDefinitionRow>> {
  if (keys.length === 0) return new Map();
  const uniq = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  if (uniq.length === 0) return new Map();

  const modern = await supabase
    .from("field_definitions")
    .select("id, key, value_type, filterable, directory_filter_visible, config")
    .in("key", uniq)
    .eq("active", true)
    .is("archived_at", null);

  const legacy =
    modern.error && `${modern.error.message} ${modern.error.code}`.includes("directory_filter_visible")
      ? await supabase
          .from("field_definitions")
          .select("id, key, value_type, filterable, config")
          .in("key", uniq)
          .eq("active", true)
          .is("archived_at", null)
      : null;

  const res = legacy && !legacy.error ? legacy : modern;
  if (res.error) {
    throw new Error(`[directory] field_definitions facet keys: ${res.error.message}`);
  }

  // Route all rows through the unified resolver helper so bridged, gender,
  // and non-bridged keys are all gated consistently. Rows fetched above are
  // active + non-archived (.eq("active",true).is("archived_at",null)) so we
  // can synthesize those flags. tenant_id is not in the select; tenantId
  // is carried in ctx for the canonical workspace-override lookup.
  const ctx: PublicSurfaceContext = { supabase, tenantId: opts.tenantId ?? null };
  const facetRows = (res.data ?? []) as DirectoryFacetDefinitionRow[];
  const visible = await Promise.all(
    facetRows.map((row) =>
      isResolvedFieldVisibleInDirectoryFilter(
        {
          key: row.key,
          // Modern rows have directory_filter_visible; legacy-fallback rows
          // (missing the column) carry filterable — normalize here.
          directory_filter_visible:
            row.directory_filter_visible != null
              ? row.directory_filter_visible
              : Boolean(row.filterable),
          active: true,      // enforced by .eq("active", true) above
          archived_at: null, // enforced by .is("archived_at", null) above
          tenant_id: null,   // not in select; ctx.tenantId carries the scope
        },
        ctx,
      ),
    ),
  );
  const map = new Map<string, DirectoryFacetDefinitionRow>();
  for (let i = 0; i < facetRows.length; i++) {
    if (visible[i]) map.set(facetRows[i].key, facetRows[i]);
  }

  // T3.1 — overlay the facet `filter_options` vocab from canonical System B
  // (`directory_filter_config`) behind the `directory_facets` flag. When the flag
  // is `b`, each visible key's vocab is sourced from B (the migrated home);
  // absent/throwing B reads leave `bFilterOptions` unset so the apply step falls
  // back to the row's own A `config` vocab (byte-identical to today).
  const bConfig = await loadDirectoryFacetConfigByLegacyKey(supabase, [...map.keys()]);
  for (const [key, def] of map) {
    const cfg = bConfig.get(key);
    if (cfg?.filterOptions && cfg.filterOptions.length > 0) {
      def.bFilterOptions = cfg.filterOptions;
    }
  }
  return map;
}
