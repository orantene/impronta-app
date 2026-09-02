import type { SupabaseClient } from "@supabase/supabase-js";
import type { DirectoryFieldFacetSelection } from "@/lib/directory/types";
import {
  isResolvedFieldVisibleInDirectoryFilter,
  type PublicSurfaceContext,
} from "@/lib/field-engine/public-surface-visibility";
import { fetchDirectoryFacetTalentIds } from "@/lib/field-engine/read-source-directory-facets";
import { loadDirectoryFacetConfigByLegacyKey } from "@/lib/field-engine/read-source-directory-facet-config";
import { DIRECTORY_FILTER_CATALOG_REGISTRY } from "@/lib/field-engine/directory-field-catalog-registry";
import { OLD_TO_NEW_KEY } from "@/lib/fields/legacy-mirror";

/** True when a legacy facet key bridges to a canonical System B definition (the
 *  only store the facet value reader can read post-T3.2b). Gender is handled by
 *  its own column-backed path and never reaches the bridged-value reader. */
function facetKeyHasCanonicalBridge(legacyKey: string): boolean {
  return Boolean(OLD_TO_NEW_KEY[legacyKey]);
}

/** Canonical `talent_profiles.gender` — filtered via column, not `field_values`. */
export const DIRECTORY_CANONICAL_GENDER_FIELD_KEY = "gender";

/**
 * The `languages` facet — filtered via `talent_languages`, not the field-value
 * store and not the taxonomy.
 *
 * The catalog declares this facet `value_type: "taxonomy_multi"` with
 * `taxonomy_kind: "language"`, but there are ZERO `taxonomy_terms` of that
 * kind, so the facet resolved to an empty option list and silently never
 * rendered — while 108 rows across 36 profiles sat in `talent_languages` with
 * nowhere to be filtered from. Same shape of defect as the gender facet, which
 * is column-backed and gets its own branch above; this is that branch for
 * languages.
 *
 * Option ids are ISO language codes (`talent_languages.language_code`), chosen
 * over term ids because there is no term vocabulary to point at.
 */
export const DIRECTORY_LANGUAGES_FIELD_KEY = "languages";

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

// The facet VALUE-store read lives behind the field-engine read seam:
// `fetchDirectoryFacetTalentIds` in read-source-directory-facets.ts. T3.2
// collapsed that surface to canonical System B (`talent_profile_field_values`)
// ONLY — the legacy System A `field_values` reader is gone; both seam legs read
// B. Gender + height are NOT routed through it — they read indexed
// `talent_profiles` columns.

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
/**
 * Talent ids that speak ANY of `languageCodes`, narrowed to
 * `constrainedTalentIds` when the pipeline has already filtered.
 *
 * OR within the facet (a client asking for English-or-Italian wants either),
 * matching how every other multi-value facet in this pipeline behaves.
 *
 * NOT tenant-scoped on purpose: `talent_languages.tenant_id` records who
 * entered the row, but which languages a person speaks is a property of the
 * person, not of the agency that typed it in. A talent on three rosters speaks
 * the same languages on all three. Contrast `price-from.ts`, where the tenant
 * scope IS load-bearing because agencies negotiate different rates.
 */
async function fetchLanguageProfileIds(
  supabase: SupabaseClient,
  languageCodes: string[],
  constrainedTalentIds: string[] | null,
): Promise<string[]> {
  const out = new Set<string>();
  const codes = [...new Set(languageCodes.map((c) => c.trim().toLowerCase()).filter(Boolean))];
  if (codes.length === 0) return [];

  const chunks: (string[] | null)[] =
    constrainedTalentIds == null
      ? [null]
      : constrainedTalentIds.length === 0
        ? []
        : Array.from(
            { length: Math.ceil(constrainedTalentIds.length / ID_CHUNK) },
            (_, i) => constrainedTalentIds.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK),
          );

  for (const chunk of chunks) {
    let q = supabase
      .from("talent_languages")
      .select("talent_profile_id")
      .in("language_code", codes);
    if (chunk) q = q.in("talent_profile_id", chunk);
    const { data, error } = await q;
    if (error || !data) continue;
    for (const row of data as { talent_profile_id: string }[]) {
      out.add(row.talent_profile_id);
    }
  }
  return [...out];
}

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

    if (def.key === DIRECTORY_LANGUAGES_FIELD_KEY) {
      const next = await fetchLanguageProfileIds(supabase, values, ids);
      if (next.length === 0) return { filteredTalentIds: [], isEmpty: true };
      ids = next;
      continue;
    }

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

    // T3.2b — the facet VALUE store is canonical System B only (System A
    // retired). A scalar facet whose key has no A→B bridge cannot be read from
    // B, so SKIP it (leave the id constraint unchanged) rather than narrowing
    // the result to an empty set. In practice every facet that reaches here is
    // bridged (the catalog gates on B); this is the latent-edge guard.
    if (!facetKeyHasCanonicalBridge(def.key)) continue;

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

/** The frozen filter catalog projected to the facet-def shape, keyed by A key.
 *  T3.2b — the facet defs used to come from `field_definitions WHERE key IN
 *  (...)`; they are now the frozen registry (captured 1:1 from prod). Liveness
 *  is still re-gated on canonical System B by `loadDirectoryFacetDefinitionsByKey`. */
const FACET_DEF_BY_KEY = new Map<string, DirectoryFacetDefinitionRow>(
  DIRECTORY_FILTER_CATALOG_REGISTRY.map((r) => [
    r.key,
    {
      id: r.id,
      key: r.key,
      value_type: r.value_type,
      filterable: r.filterable,
      directory_filter_visible: true,
      config: r.config,
    },
  ]),
);

export async function loadDirectoryFacetDefinitionsByKey(
  supabase: SupabaseClient,
  keys: string[],
  opts: { tenantId?: string | null } = {},
): Promise<Map<string, DirectoryFacetDefinitionRow>> {
  if (keys.length === 0) return new Map();
  const uniq = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  if (uniq.length === 0) return new Map();

  // Pull the requested keys from the frozen catalog registry (System A retired).
  const facetRows = uniq
    .map((k) => FACET_DEF_BY_KEY.get(k))
    .filter((r): r is DirectoryFacetDefinitionRow => Boolean(r));

  // Route all rows through the unified resolver helper so bridged, gender, and
  // non-bridged keys are all gated consistently. The frozen rows are the
  // canonical (tenant_id IS NULL) set; tenantId is carried in ctx for the
  // canonical workspace-override lookup.
  const ctx: PublicSurfaceContext = { supabase, tenantId: opts.tenantId ?? null };
  const visible = await Promise.all(
    facetRows.map((row) =>
      isResolvedFieldVisibleInDirectoryFilter(
        {
          key: row.key,
          directory_filter_visible: row.directory_filter_visible ?? true,
          active: true,
          archived_at: null,
          tenant_id: null,
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
