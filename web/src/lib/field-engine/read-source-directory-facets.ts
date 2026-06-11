// src/lib/field-engine/read-source-directory-facets.ts
//
// T2.1 — DIRECTORY FACET VALUE-STORE repoint (the parity-critical surface).
//
// The directory's scalar `ff` facets (body_type, eye_color, hair_color,
// hair_length, dress_size, experience.level, availability.status, travel.scope,
// travel.willing, …) decide WHICH talents match a chosen filter option. Today
// that decision reads legacy System A (`field_values` joined on the A
// `field_definition_id`). This module lifts that read behind the shared seam as
// `readA` (byte-identical) and adds a `readB` that reads canonical System B
// (`talent_profile_field_values`) returning the IDENTICAL `string[]` of matching
// `talent_profile_id`s. The caller (`apply-directory-field-facet-filters.ts`)
// calls the seam; the `directory_facets` flag decides A vs B.
//
// THE VOCAB BRIDGE (the crux):
//   System A `field_values.value_text` stores option SLUGS ("athletic",
//   "dark_brown"). The facet OPTIONS the user filters by come from A's
//   `config.filter_options` — also slugs. System B `talent_profile_field_values`
//   stores a MIX: canonical option LABELS ("Athletic", "Dark brown") AND, for
//   keys whose A→B vocab never matched (availability.status, experience.level,
//   travel.scope), the A SLUG verbatim (the mirror copied it through). A naive
//   repoint that matched B by the incoming A-slug would MISS the label rows and
//   return a smaller (wrong) set.
//
//   So `readB` translates each incoming A-slug into a CANDIDATE B-match set:
//     { the raw A-slug }  ∪  { matchLabelOption(B-option-labels, A-slug) if any }
//   then matches B `value` by NORMALIZED equality (lower + collapse [-_/space]+
//   → space) against that set. Normalization makes "Athletic"≈"athletic",
//   "Dark brown"≈"dark_brown", "region"="region" all compare equal — the same
//   collapser the parity harness uses. Verified read-only against prod ref
//   pluhdapdnuiulvxmyspd (2026-06-11): for EVERY in-scope facet option with any
//   talents, A-count == B-count and the symmetric id difference is 0. (Full
//   per-option table is in the PR body.)
//
// SCOPE: only the VALUE-store read moves. The facet CONFIG/options + the slug
// vocabulary the user filters by STAY on System A (B has no `config` jsonb;
// migrating config/options onto B is T3.1 — do NOT half-migrate here). Height +
// gender facets read the indexed `talent_profiles` columns (T1.1) and never hit
// this module — they are untouched.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldSurfaceReaderPair } from "@/lib/field-engine/read-source";
import { readFieldSurface } from "@/lib/field-engine/read-source";
import { matchLabelOption } from "@/lib/fields/coerce-select-value";
import { OLD_TO_NEW_KEY } from "@/lib/fields/legacy-mirror";

/** Same chunk size as the legacy value-store reader (PostgREST `.in(...)` cap). */
const ID_CHUNK = 450;

/** A scalar facet filter, already narrowed to the value-store shape the directory
 *  applies: a boolean set (matched on the bool column / jsonb bool) or a text set
 *  of A-vocab option SLUGS (matched on the text column / jsonb scalar). Identical
 *  to the legacy reader's `filter` argument so `readA` is byte-for-byte today. */
export type DirectoryFacetValueFilter =
  | { kind: "boolean"; values: boolean[] }
  | { kind: "text"; values: string[] };

/** What the seam needs about the facet to read EITHER store. `aFieldDefinitionId`
 *  drives `readA` (legacy `field_values.field_definition_id`); `fieldKey` drives
 *  `readB` (resolve the canonical def via the A→B key bridge). */
export type DirectoryFacetReadTarget = {
  /** Legacy `field_definitions.key` (e.g. "body_type"). */
  fieldKey: string;
  /** Legacy `field_definitions.id` — the A value-store join key. */
  aFieldDefinitionId: string;
};

// ── Vocab bridge (PURE — unit-tested) ────────────────────────────────────────

/** Lower + collapse runs of `[-_/ whitespace]` to a single space + trim. The
 *  same normalization the parity harness applies, so slug↔label↔case drift all
 *  compare equal ("Dark brown" == "dark_brown" == "dark-brown"). */
export function normalizeFacetValue(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[-_/\s]+/g, " ")
    .trim();
}

/**
 * Translate one incoming A-vocab option SLUG into the set of NORMALIZED values
 * that should match in System B.
 *
 * B stores either the canonical option LABEL or (for un-bridged vocabularies)
 * the A slug verbatim, so the candidate set is BOTH:
 *   - the A slug itself (catches slug-residue + same-vocab keys), and
 *   - `matchLabelOption(bOptionLabels, slug)` — the canonical label the slug maps
 *     to, if the field is a B select whose labels resolve the slug.
 * Both are returned NORMALIZED (deduped) so the caller matches B `value` by
 * normalized equality. An A slug with no B-label match (e.g. body_type
 * "average", eye_color "gray") still yields its own normalized form — and since
 * B carries that same orphan value verbatim, it still matches (proven at
 * parity). Nothing silently vanishes.
 */
export function directoryFacetSlugToBMatchSet(
  slug: string,
  bOptionLabels: readonly string[],
): string[] {
  const out = new Set<string>();
  const norm = normalizeFacetValue(slug);
  if (norm) out.add(norm);
  const matchedLabel = matchLabelOption(bOptionLabels, slug);
  if (matchedLabel) {
    const n = normalizeFacetValue(matchedLabel);
    if (n) out.add(n);
  }
  return [...out];
}

/** Booleans that count as `true` / `false` when read from B's jsonb scalar.
 *  Mirrors the directory's own `parseBooleanFacetValues` token set so a B bool
 *  stored as a json string ("true"/"yes"/"1") or a json bool both resolve. */
function jsonScalarToBool(scalar: string | null): boolean | null {
  if (scalar == null) return null;
  const t = scalar.trim().toLowerCase();
  if (t === "true" || t === "1" || t === "yes" || t === "t") return true;
  if (t === "false" || t === "0" || t === "no" || t === "f") return false;
  return null;
}

// ── A-reader: legacy System A (`field_values`) ───────────────────────────────
//
// Lifted VERBATIM from `fetchFieldValueTalentIds` in
// apply-directory-field-facet-filters.ts so `directory_facets:a` is byte-for-byte
// today. Reads `field_values` by the legacy `field_definition_id`, ANDed onto the
// already-constrained id set, chunked by ID_CHUNK. Text match is case-insensitive
// exact on `value_text`; boolean match is `value_boolean IN (...)`.
async function readDirectoryFacetIdsFromA(
  supabase: SupabaseClient,
  target: DirectoryFacetReadTarget,
  filter: DirectoryFacetValueFilter,
  constrainedTalentIds: string[] | null,
): Promise<string[]> {
  const acc = new Set<string>();
  const textValues =
    filter.kind === "text"
      ? new Set(filter.values.map((value) => value.trim().toLowerCase()).filter(Boolean))
      : null;

  const runBatch = async (idChunk: string[] | null) => {
    let q = supabase
      .from("field_values")
      .select("talent_profile_id,value_text")
      .eq("field_definition_id", target.aFieldDefinitionId);
    if (idChunk) {
      if (idChunk.length === 0) return;
      q = q.in("talent_profile_id", idChunk);
    }
    if (filter.kind === "boolean") {
      q = q.in("value_boolean", filter.values);
    } else {
      q = q.not("value_text", "is", null);
    }
    const { data, error } = await q;
    if (error) throw new Error(`[directory] field_values facet: ${error.message}`);
    for (const row of (data ?? []) as { talent_profile_id: string; value_text?: string | null }[]) {
      if (textValues && !textValues.has((row.value_text ?? "").trim().toLowerCase())) {
        continue;
      }
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

// ── B-reader: canonical System B (`talent_profile_field_values`) ─────────────
//
// Same projected shape (`string[]` of talent_profile_id). Resolves the B
// definition via the A→B key bridge, builds the per-slug candidate match set via
// the vocab bridge, then reads the canonical store and matches B `value` by
// normalized equality (text) or jsonb bool (boolean). Constrained-id chunking +
// the empty-constraint short-circuit mirror the A-reader so the AND semantics are
// identical. If the B definition can't be resolved the reader THROWS so the seam
// safe-falls-back to A (never silently returns an empty/wrong set).
async function readDirectoryFacetIdsFromB(
  supabase: SupabaseClient,
  target: DirectoryFacetReadTarget,
  filter: DirectoryFacetValueFilter,
  constrainedTalentIds: string[] | null,
): Promise<string[]> {
  const bKey = OLD_TO_NEW_KEY[target.fieldKey];
  if (!bKey) {
    // No canonical bridge for this legacy key — cannot read B. Throw so the seam
    // degrades to A rather than dropping the facet (would widen the result set).
    throw new Error(`[directory] facet ${target.fieldKey}: no canonical (System B) key`);
  }

  const { data: defRows, error: defErr } = await supabase
    .from("profile_field_definitions")
    .select("id, options, kind")
    .eq("field_key", bKey)
    .is("deprecated_at", null);
  if (defErr) {
    throw new Error(`[directory] facet ${target.fieldKey} → ${bKey} def: ${defErr.message}`);
  }
  const defIds = ((defRows ?? []) as { id: string }[]).map((r) => r.id).filter(Boolean);
  if (defIds.length === 0) {
    throw new Error(`[directory] facet ${target.fieldKey} → ${bKey}: no canonical definition`);
  }

  // Build the normalized candidate match set (text only). The B select labels
  // come from the canonical definition's `options` (bare-label list).
  const bOptionLabels: string[] = [];
  for (const row of (defRows ?? []) as { options?: unknown }[]) {
    if (Array.isArray(row.options)) {
      for (const o of row.options) {
        const s = String(o ?? "").trim();
        if (s) bOptionLabels.push(s);
      }
    }
  }
  const normMatchSet =
    filter.kind === "text"
      ? new Set(
          filter.values.flatMap((slug) =>
            directoryFacetSlugToBMatchSet(slug, bOptionLabels),
          ),
        )
      : null;
  const boolSet = filter.kind === "boolean" ? new Set(filter.values) : null;

  const acc = new Set<string>();
  const runBatch = async (idChunk: string[] | null) => {
    let q = supabase
      .from("talent_profile_field_values")
      .select("talent_profile_id,value")
      .in("field_definition_id", defIds);
    if (idChunk) {
      if (idChunk.length === 0) return;
      q = q.in("talent_profile_id", idChunk);
    }
    const { data, error } = await q;
    if (error) {
      throw new Error(`[directory] talent_profile_field_values facet: ${error.message}`);
    }
    for (const row of (data ?? []) as { talent_profile_id: string; value: unknown }[]) {
      // jsonb scalar → text (json string/number/bool collapse to a string).
      const scalar =
        row.value == null
          ? null
          : typeof row.value === "string"
            ? row.value
            : typeof row.value === "number" || typeof row.value === "boolean"
              ? String(row.value)
              : null; // arrays/objects are never these scalar facets
      if (scalar == null) continue;
      if (boolSet) {
        const b = jsonScalarToBool(scalar);
        if (b !== null && boolSet.has(b)) acc.add(row.talent_profile_id);
        continue;
      }
      if (normMatchSet && normMatchSet.has(normalizeFacetValue(scalar))) {
        acc.add(row.talent_profile_id);
      }
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

/** The reader pair, exposed so a test/diagnostic can run A and B side by side via
 *  `readFieldSurfaceBoth` without going through the env flag. */
export const directoryFacetReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient, DirectoryFacetReadTarget, DirectoryFacetValueFilter, string[] | null],
  string[]
> = {
  readA: readDirectoryFacetIdsFromA,
  readB: readDirectoryFacetIdsFromB,
};

/**
 * PUBLIC entry — return the `talent_profile_id`s matching this scalar facet
 * filter, reading the active value store for the `directory_facets` surface. The
 * caller passes the legacy facet target + the value filter + the already-
 * constrained id set; the flag decides A vs B. A B-read that throws safe-falls-
 * back to A (the surface never hardens into a broken/empty facet).
 */
export function fetchDirectoryFacetTalentIds(
  supabase: SupabaseClient,
  target: DirectoryFacetReadTarget,
  filter: DirectoryFacetValueFilter,
  constrainedTalentIds: string[] | null,
): Promise<string[]> {
  return readFieldSurface(
    "directory_facets",
    directoryFacetReaderPair,
    supabase,
    target,
    filter,
    constrainedTalentIds,
  );
}
