// src/lib/field-engine/read-source-directory-card-values.ts
//
// T2.5a — PER-PROFILE DIRECTORY CARD VALUE repoint.
//
// `fetch-directory-page.ts` builds each card's attribute lines from a read of
// `field_values` by the card definition ids (`scalarCardDefs[].id`), keyed into
// `valuesByProfileId: Map<profileId, Map<aDefId, FieldValueRow>>` and rendered by
// `buildCardAttributesForProfile` (which looks rows up by the A def-id). This
// module lifts that read behind the shared read-source seam as `readA`
// (byte-identical) and adds a `readB` that reads canonical System B for the SAME
// projected map (same A-def-id key, same `FieldValueRow` shape) so the caller
// and the renderer never change.
//
// THE DEF-ID BRIDGE (the crux T2.4 deferred):
//   The A read joins `field_values` on the A `field_definition_id`. System B has
//   no such id. So `readB` maps each card def's A `key` → B `field_key` via the
//   legacy-mirror bridge (`OLD_TO_NEW_KEY`), reads `talent_profile_field_values`
//   for the resolved B defs, and projects each B row back into a `FieldValueRow`
//   stored under the ORIGINAL A def-id — so `buildCardAttributesForProfile`,
//   which does `valuesByDefId.get(def.id)`, finds it unchanged.
//
//   Only BRIDGED SCALAR card defs (text / number / boolean / date) can be read
//   from B. The card-visible catalog's non-height/non-fit scalar defs today are
//   `talent_type` (taxonomy_single), `industries` (taxonomy_multi) and `location`
//   (location) — none bridged, none scalar, and each carries ZERO field_values
//   scalar rows under A (verified read-only against prod ref pluhdapdnuiulvxmyspd,
//   2026-06-11). They render from `talent_profile_taxonomy` assignments via
//   `formatTaxonomyCardValueFromAssignments` in BOTH stores, so the card output
//   is byte-identical. The B-reader simply yields no rows for them (correct).
//   When an admin later marks a BRIDGED scalar field (e.g. body_type) card_visible,
//   the def-id bridge reads its values from B; A-vs-B value agreement for that
//   projection is proven 100% (e.g. body_type: 69/69 rows, 69/69 normalized-equal,
//   public cohort).
//
// VOCAB: B stores canonical option LABELS ("Athletic") where A stored slugs
//   ("athletic"); the card simply renders the stored text, so the LABEL is shown
//   (a strict improvement — the same slug→label upgrade T2.1/T2.4 made). For the
//   card path this is the rendered string itself, not a filter key, so no
//   translation is needed (and none of the bridged scalar keys are currently
//   card_visible anyway).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldSurfaceReaderPair } from "@/lib/field-engine/read-source";
import { readFieldSurface } from "@/lib/field-engine/read-source";
import type { FieldValueRow } from "@/lib/directory/format-card-attribute-value";
import type { DirectoryCardScalarDef } from "@/lib/directory/directory-card-display-catalog";
import { OLD_TO_NEW_KEY } from "@/lib/fields/legacy-mirror";

/** Same chunk size as the directory's other value-store readers (PostgREST cap). */
const ID_CHUNK = 450;

/** The projected output: `Map<talent_profile_id, Map<aDefId, FieldValueRow>>` —
 *  IDENTICAL to what the caller built inline, so `buildCardAttributesForProfile`
 *  consumes it unchanged. */
export type CardValuesByProfileId = Map<string, Map<string, FieldValueRow>>;

function ensureInner(map: CardValuesByProfileId, profileId: string): Map<string, FieldValueRow> {
  let inner = map.get(profileId);
  if (!inner) {
    inner = new Map();
    map.set(profileId, inner);
  }
  return inner;
}

/** Project a System B jsonb scalar into the typed `FieldValueRow` columns the
 *  renderer reads, per the card def's `value_type`. Mirrors
 *  `formatCardAttributeValue`'s column expectations exactly. */
function projectBValueToFieldValueRow(
  aDef: DirectoryCardScalarDef,
  profileId: string,
  value: unknown,
): FieldValueRow {
  const row: FieldValueRow = {
    talent_profile_id: profileId,
    field_definition_id: aDef.id, // keyed by the A def-id so the renderer finds it
    value_text: null,
    value_number: null,
    value_boolean: null,
    value_date: null,
    value_taxonomy_ids: null,
  };
  // jsonb scalar → primitive.
  const scalar =
    value == null
      ? null
      : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? value
        : null;
  if (scalar == null) return row;
  switch (aDef.value_type) {
    case "number":
      row.value_number = typeof scalar === "number" ? scalar : Number(scalar);
      break;
    case "boolean":
      row.value_boolean =
        typeof scalar === "boolean"
          ? scalar
          : ["true", "1", "yes", "t"].includes(String(scalar).trim().toLowerCase());
      break;
    case "date":
      row.value_date = typeof scalar === "string" ? scalar : null;
      break;
    default:
      // text / textarea / anything scalar → the rendered string.
      row.value_text = String(scalar);
      break;
  }
  return row;
}

// ── B-reader: canonical System B (`talent_profile_field_values`) ─────────────
//
// Same projected map. Resolves each BRIDGED SCALAR card def's B definition via
// the A→B key bridge, reads the canonical store (chunked by profile id), and
// projects each B row into a `FieldValueRow` stored under the A def-id. Non-bridged
// / non-scalar card defs (taxonomy/location) yield no B rows — correct, they
// render from taxonomy assignments. Throws only on a real DB error (the seam
// re-runs this same B reader on a throw; System A is retired — no A fallback).
async function readDirectoryCardValuesFromB(
  supabase: SupabaseClient,
  cardDefs: readonly DirectoryCardScalarDef[],
  profileIds: readonly string[],
): Promise<CardValuesByProfileId> {
  const out: CardValuesByProfileId = new Map();
  if (profileIds.length === 0) return out;

  // Resolve the bridged scalar card defs to their B field_keys, remembering the
  // originating A def for the projection. Taxonomy/location value types never
  // store scalar field_values, so they are excluded (they would never resolve a
  // scalar B value anyway).
  const SCALAR_TYPES = new Set(["text", "textarea", "number", "boolean", "date"]);
  const bKeyToADef = new Map<string, DirectoryCardScalarDef>();
  for (const def of cardDefs) {
    if (!SCALAR_TYPES.has(def.value_type)) continue;
    const bKey = OLD_TO_NEW_KEY[def.key];
    if (bKey) bKeyToADef.set(bKey, def);
  }
  if (bKeyToADef.size === 0) return out; // nothing bridged+scalar → empty (matches A here)

  const bKeys = [...bKeyToADef.keys()];
  const { data: defRows, error: defErr } = await supabase
    .from("profile_field_definitions")
    .select("id, field_key")
    .in("field_key", bKeys)
    .is("deprecated_at", null);
  if (defErr) {
    throw new Error(`[directory] card-values canonical def: ${defErr.message}`);
  }
  // B def-id → originating A def (via field_key).
  const bDefIdToADef = new Map<string, DirectoryCardScalarDef>();
  for (const r of (defRows ?? []) as { id: string; field_key: string }[]) {
    const aDef = bKeyToADef.get(r.field_key);
    if (r.id && aDef) bDefIdToADef.set(r.id, aDef);
  }
  if (bDefIdToADef.size === 0) return out;

  const bDefIds = [...bDefIdToADef.keys()];
  const ids = [...profileIds];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const { data, error } = await supabase
      .from("talent_profile_field_values")
      .select("talent_profile_id, field_definition_id, value")
      .in("talent_profile_id", chunk)
      .in("field_definition_id", bDefIds);
    if (error) {
      throw new Error(`[directory] card-values canonical values: ${error.message}`);
    }
    for (const row of (data ?? []) as {
      talent_profile_id: string;
      field_definition_id: string;
      value: unknown;
    }[]) {
      const aDef = bDefIdToADef.get(row.field_definition_id);
      if (!aDef) continue;
      const fvRow = projectBValueToFieldValueRow(aDef, row.talent_profile_id, row.value);
      ensureInner(out, row.talent_profile_id).set(aDef.id, fvRow);
    }
  }
  return out;
}

/** The reader pair, exposed so a test/diagnostic can run A and B side by side via
 *  `readFieldSurfaceBoth` without going through the env flag. */
export const directoryCardValuesReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient, readonly DirectoryCardScalarDef[], readonly string[]],
  CardValuesByProfileId
> = {
  // T3.2 — System A removed: the legacy `field_values` A-reader was deleted.
  // Both legs read canonical System B (`talent_profile_field_values`), projecting
  // each B row back into the A-def-id-keyed `FieldValueRow` the renderer expects.
  readA: readDirectoryCardValuesFromB,
  readB: readDirectoryCardValuesFromB,
};

/**
 * PUBLIC entry — return `Map<profileId, Map<aDefId, FieldValueRow>>` for the
 * directory card values, reading canonical System B for the
 * `directory_card_values` surface (T3.2: System A retired — both seam legs read
 * B; a readB throw re-runs the same B reader).
 */
export function fetchDirectoryCardValues(
  supabase: SupabaseClient,
  cardDefs: readonly DirectoryCardScalarDef[],
  profileIds: readonly string[],
): Promise<CardValuesByProfileId> {
  return readFieldSurface(
    "directory_card_values",
    directoryCardValuesReaderPair,
    supabase,
    cardDefs,
    profileIds,
  );
}
