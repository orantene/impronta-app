import type { SupabaseClient } from "@supabase/supabase-js";
import type { DirectoryFieldFacetSelection } from "@/lib/directory/types";

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
};

function filterOptionsFromConfig(
  config: Record<string, unknown> | null | undefined,
): string[] | null {
  const raw = config?.filter_options;
  if (!Array.isArray(raw)) return null;
  const out = raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
  return out.length ? out : null;
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

async function fetchFieldValueTalentIds(
  supabase: SupabaseClient,
  fieldDefinitionId: string,
  filter: { kind: "boolean"; values: boolean[] } | { kind: "text"; values: string[] },
  constrainedTalentIds: string[] | null,
): Promise<string[]> {
  const acc = new Set<string>();

  const runBatch = async (idChunk: string[] | null) => {
    let q = supabase
      .from("field_values")
      .select("talent_profile_id")
      .eq("field_definition_id", fieldDefinitionId);
    if (idChunk) {
      if (idChunk.length === 0) return;
      q = q.in("talent_profile_id", idChunk);
    }
    if (filter.kind === "boolean") {
      q = q.in("value_boolean", filter.values);
    } else {
      q = q.in("value_text", filter.values);
    }
    const { data, error } = await q;
    if (error) throw new Error(`[directory] field_values facet: ${error.message}`);
    for (const row of (data ?? []) as { talent_profile_id: string }[]) {
      acc.add(row.talent_profile_id);
    }
  };

  if (constrainedTalentIds === null) {
    await runBatch(null);
  } else if (constrainedTalentIds.length === 0) {
    return [];
  } else {
    for (let i = 0; i < constrainedTalentIds.length; i += ID_CHUNK) {
      await runBatch(constrainedTalentIds.slice(i, i + ID_CHUNK));
    }
  }
  return [...acc];
}

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
      filterOptionsFromConfig(def.config) != null;

    if (isCanonicalGender) {
      const allowed = new Set(filterOptionsFromConfig(def.config) ?? []);
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
      const next = await fetchFieldValueTalentIds(supabase, def.id, { kind: "boolean", values: bools }, ids);
      if (next.length === 0) return { filteredTalentIds: [], isEmpty: true };
      ids = next;
      continue;
    }

    if (def.value_type === "text" || def.value_type === "textarea") {
      const opts = filterOptionsFromConfig(def.config);
      if (!opts) continue;
      const allowed = new Set(opts);
      const tVals = values.filter((v) => allowed.has(v));
      if (tVals.length === 0) continue;
      const next = await fetchFieldValueTalentIds(supabase, def.id, { kind: "text", values: tVals }, ids);
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

  const map = new Map<string, DirectoryFacetDefinitionRow>();
  for (const row of (res.data ?? []) as DirectoryFacetDefinitionRow[]) {
    map.set(row.key, row);
  }
  return map;
}
