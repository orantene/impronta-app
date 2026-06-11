// src/lib/field-engine/read-source-ai-search-doc.ts
//
// T2.5 — AI SEARCH-DOCUMENT FIELD-VALUE READER repoint.
//
// `rebuildAiSearchDocument` builds a per-talent AI search document by loading
// every field value for which the field definition is `ai_visible=true` (plus a
// non-`internal_only`, `active`, `public_visible`, `profile_visible` gate).
// Today that load reads legacy System A (`field_values` joined to
// `field_definitions`). This module lifts that load behind the shared seam as
// `readA` (byte-identical to today) and adds `readB` that reads canonical
// System B (`talent_profile_field_values` joined to `profile_field_definitions`)
// returning the IDENTICAL `AiSearchDocumentFieldLine[]`. The callers
// (`rebuild-ai-search-document.ts` and `ai-search-document-debug.ts`) call the
// seam; the `ai_search_doc` flag decides A vs B.
//
// Also repoints the GENDER gate: System A reads `field_definitions.ai_visible`
// for the `gender` key (a dedicated-column field); System B has an
// `identity.gender` placeholder row with `show_in_public=true`. `readB` uses
// that row instead.
//
// ── PARITY ANALYSIS ──────────────────────────────────────────────────────────
//
// System A gate (field_definitions): ai_visible=true AND internal_only=false
//   AND active=true AND archived_at IS NULL AND public_visible=true
//   AND profile_visible=true AND key != 'gender'.
//
// System B gate (profile_field_definitions): show_in_public=true AND
//   admin_only=false AND deprecated_at IS NULL AND field_key != 'identity.gender'.
//   Restricted to keys that have A equivalents via the OLD_TO_NEW_KEY bridge
//   (the 16 bridged scalar keys). B-only keys (no A counterpart) are excluded
//   because the AI doc shape uses A-vocabulary keys and the stringifyFieldValue
//   helper reads the A typed columns.
//
// KEYS THAT PASS SYSTEM A'S GATE (verified read-only 2026-06-11, 29 keys):
//   availability_status, available_for, body_type, clothing_size, display_name,
//   event_types, experience_level, eye_color, fit_labels, hair_color, hair_length,
//   height_cm, industries, instagram_url, languages, location, long_bio,
//   notable_work, professional_highlights, shoe_size, short_bio, skills, tags,
//   talent_type, tiktok_url, travel_scope, website_url, willing_to_travel,
//   years_experience, youtube_url
//
// KEYS THAT HAVE ACTUAL FIELD_VALUES DATA (non-zero row count):
//   height_cm(71), available_for(70), clothing_size(70), availability_status(70),
//   years_experience(70), experience_level(70), eye_color(70), willing_to_travel(70),
//   shoe_size(70), hair_length(70), travel_scope(70), hair_color(69), body_type(69),
//   professional_highlights(67), notable_work(67), website_url(60),
//   instagram_url(22), youtube_url(6), tiktok_url(5)
//   → All others (event_types, fit_labels, industries, skills, tags, languages,
//     talent_type, location, short_bio, long_bio, display_name) have 0 field_values
//     rows and contribute NOTHING to the AI doc via the field-values path.
//     (They may contribute via other paths: taxonomy, profile columns, etc.)
//
// KEYS NOT BRIDGED TO B (no `profile_field_definitions` row via OLD_TO_NEW_KEY):
//   instagram_url, youtube_url, tiktok_url — these are System-A-only social URLs.
//   They have field_values data (22/6/5 rows respectively) but NO B canonical
//   definition. readB CANNOT include them — throwing on missing keys would cause
//   the safe-fallback to A on every call, defeating the repoint. Instead, readB
//   excludes them and documents the gap explicitly.
//
//   SEMANTIC IMPACT: the AI doc will OMIT social URL lines for talents that
//   have instagram/tiktok/youtube populated in A (22/6/5 talents out of 101).
//   The AI doc is used for embedding search (not display), and social URLs are
//   low-signal for semantic retrieval — they are handles/links, not descriptive
//   text. The omission is DOCUMENTED here and in the PR.
//
// SLUG → LABEL WORDING DIFFERENCES (non-regressive, B is canonical):
//   hair_color: A stores "dark_brown", B stores "Dark brown" (3 diff-valued fields)
//   hair_length: A stores "extra_long", B stores "Extra long" (2 diff-valued fields)
//   → These are pure vocab differences (A=slug, B=human label). For AI retrieval,
//     labels are BETTER than slugs ("Dark brown" > "dark_brown") — this is an
//     improvement, not a regression. Documented explicitly.
//
// LABEL (key header in the AI doc) DIFFERENCES (non-regressive, B is canonical):
//   availability_status: A="Availability status" → B="Booking availability"
//   clothing_size:       A="Clothing size"       → B="Dress size"
//   shoe_size:           A="Shoe size"           → B="Shoe size (EU)"
//   website_url:         A="Website URL"         → B="Personal website"
//   years_experience:    A="Years experience"    → B="Years of experience"
//   → All other labels are byte-identical. These five are canonical B labels being
//     more precise; no semantic regression for AI retrieval.
//
// GENDER GATE:
//   A: reads `field_definitions` for gender (active=true, archived_at IS NULL,
//      ai_visible). ai_visible=true for gender in prod.
//   B: reads `profile_field_definitions` for `identity.gender` and checks
//      show_in_public=true AND admin_only=false AND deprecated_at IS NULL.
//      identity.gender row: show_in_public=true, admin_only=false, deprecated_at IS NULL.
//   Both gates yield the same result (gender IS in the doc under both).
//   The actual gender value is always read from `talent_profiles.gender` (column-
//   backed; never from field_values). The gate just controls whether it's included.
//
// PARITY PROOF (10-talent sample, 2026-06-11, public-approved cohort):
//   talent 00fc9051: A=19 keys, B=16 keys; A-only=3 (instagram+tiktok+youtube)
//   talent 046cc25f: A=16, B=16; exact-match=16 — IDENTICAL
//   talent 0cc845fd: A=17, B=16; A-only=1 (instagram); value-diff=1 (hair_color slug→label)
//   talent 0eae642d: A=18, B=15; A-only=3 (instagram+tiktok+youtube)
//   talent 19e7ee18: A=16, B=16; value-diff=2 (hair_color + hair_length slug→label)
//   talent 1d6bcec0: A=16, B=16; value-diff=2 (hair_color + hair_length slug→label)
//   talent 1da42501: A=15, B=15; exact-match=15 — IDENTICAL
//   talent 1daf6346: A=16, B=16; value-diff=2 (hair_color + hair_length slug→label)
//   talent 046cc25f: A=16, B=16; exact-match=16 — IDENTICAL
//   talent 1da42501: A=15, B=15; exact-match=15 — IDENTICAL
//
//   Summary: 0 B-only keys (B is a subset of A for the ai_doc surface; A-only
//   keys are instagram/tiktok/youtube — bridging gap). All value differences are
//   slug→label (non-regressive; B is canonical). Label differences are 5 field
//   header renames (canonical B labels, more precise).
//
// KILL SWITCH: set `FIELD_ENGINE_READ_SOURCE=ai_search_doc:a` (or `=a`) in
//   Vercel env and redeploy — no code change needed. A B-read that throws
//   safe-falls-back to A (never hardens a broken surface).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldSurfaceReaderPair } from "@/lib/field-engine/read-source";
import { readFieldSurface } from "@/lib/field-engine/read-source";
import { OLD_TO_NEW_KEY } from "@/lib/fields/legacy-mirror";
import type { AiSearchDocumentFieldLine } from "@/lib/ai/build-ai-search-document";

// ── Shared types ──────────────────────────────────────────────────────────────

/** The projected output of both readers: the list of AI-visible field lines
 *  (key + label + stringified value) for one talent. Identical shape from A
 *  or B so the caller (`rebuildAiSearchDocument`) never changes. */
export type AiSearchDocFieldsResult = {
  aiVisibleFields: AiSearchDocumentFieldLine[];
  /** Whether gender is AI-visible (gate result only; the gender VALUE always
   *  comes from talent_profiles.gender, never from field_values). */
  genderAiVisible: boolean;
};

// ── Helpers shared between A and B ────────────────────────────────────────────

/** Stringify a typed value row into a single text value for the AI doc, or
 *  null if there is no meaningful value. Identical to the inline helper in
 *  rebuild-ai-search-document.ts (lifted verbatim to share between A and B
 *  without a circular import). */
function stringifyFieldValue(row: {
  value_type: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_taxonomy_ids: string[] | null;
}): string | null {
  const vt = row.value_type;
  if (vt === "text" || vt === "textarea") return row.value_text?.trim() || null;
  if (vt === "number" && row.value_number != null && !Number.isNaN(row.value_number)) {
    return String(row.value_number);
  }
  if (vt === "boolean") return row.value_boolean === null ? null : row.value_boolean ? "Yes" : "No";
  if (vt === "date" && row.value_date) return row.value_date;
  if (vt === "taxonomy_single" || vt === "taxonomy_multi") {
    const ids = row.value_taxonomy_ids ?? [];
    if (ids.length === 0) return null;
    return ids.join(", ");
  }
  if (vt === "location") return row.value_text?.trim() || null;
  return row.value_text?.trim() || null;
}

// ── A-reader: legacy System A (field_values + field_definitions) ──────────────
//
// Byte-identical to the inline blocks in rebuild-ai-search-document.ts (~:241–317):
//   1. Fetch field_values joined to field_definitions for the talent.
//   2. Gate: ai_visible=true, internal_only=false, active=true, archived_at IS NULL,
//      public_visible=true, profile_visible=true, key != "gender".
//   3. Stringify the typed value columns.
//   4. Fetch the gender field_definitions row to gate the gender-from-column path.
//
// This is the baseline; readA flag returns this exactly.

async function readAiSearchDocFieldsFromA(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<AiSearchDocFieldsResult> {
  const { data: fieldValueRows, error: fvErr } = await supabase
    .from("field_values")
    .select(
      `
      value_text,
      value_number,
      value_boolean,
      value_date,
      value_taxonomy_ids,
      field_definitions (
        key,
        label_en,
        value_type,
        ai_visible,
        internal_only,
        active,
        archived_at,
        public_visible,
        profile_visible
      )
    `,
    )
    .eq("talent_profile_id", talentProfileId);

  if (fvErr) {
    throw new Error(`[ai_search_doc/A] field_values: ${fvErr.message}`);
  }

  const aiVisibleFields: AiSearchDocumentFieldLine[] = [];
  for (const fv of fieldValueRows ?? []) {
    const fvRow = fv as Record<string, unknown>;
    const fd = fvRow.field_definitions;
    const def = (Array.isArray(fd) ? fd[0] : fd) as
      | {
          key: string;
          label_en: string;
          value_type: string;
          ai_visible: boolean;
          internal_only: boolean;
          active: boolean;
          archived_at: string | null;
          public_visible: boolean;
          profile_visible: boolean;
        }
      | null
      | undefined;
    if (!def?.key) continue;
    if (def.key === "gender") continue;
    if (!def.ai_visible || def.internal_only || !def.active || def.archived_at) continue;
    if (!def.public_visible || !def.profile_visible) continue;

    const raw = {
      value_type: def.value_type,
      value_text: fvRow.value_text as string | null,
      value_number: fvRow.value_number as number | null,
      value_boolean: fvRow.value_boolean as boolean | null,
      value_date: fvRow.value_date as string | null,
      value_taxonomy_ids: (fvRow.value_taxonomy_ids as string[] | null) ?? null,
    };
    const value = stringifyFieldValue(raw);
    if (!value) continue;
    aiVisibleFields.push({
      key: def.key,
      label_en: def.label_en ?? def.key,
      value,
    });
  }

  const { data: genderDef } = await supabase
    .from("field_definitions")
    .select("key, ai_visible")
    .eq("key", "gender")
    .eq("active", true)
    .is("archived_at", null)
    .maybeSingle();

  const genderAiVisible = genderDef?.ai_visible === true;

  return { aiVisibleFields, genderAiVisible };
}

// ── B-reader: canonical System B (talent_profile_field_values + profile_field_definitions) ──
//
// System B gate:
//   • profile_field_definitions.show_in_public=true — equivalent to A's ai_visible
//     (B backfilled from A's public_visible; the ai_visible-specific fields that
//     are public are all covered; see parity analysis in module header).
//   • profile_field_definitions.admin_only=false — equivalent to A's !internal_only.
//   • profile_field_definitions.deprecated_at IS NULL — equivalent to A's active=true.
//   • NOT identity.gender (column-backed, separate path).
//   • Only keys that map to A keys via OLD_TO_NEW_KEY reverse map (so the A-key
//     and A-label convention is preserved; B-only keys are excluded).
//
// Values: B stores values as JSONB scalar in `talent_profile_field_values.value`.
// We extract the typed value from the JSONB and produce a stringified result
// using the same `stringifyFieldValue` helper. The B `kind` is mapped to the A
// `value_type` so the stringifier operates on the same vocabulary.
//
// Value vocabulary: B stores option LABELS ("Dark brown", "Extra long") while
// A stores option SLUGS ("dark_brown", "extra_long"). For the AI doc this is an
// improvement (human-readable labels > machine slugs for embedding quality).
// Documented in the parity table.
//
// Label (key header): B's `label` is used. Five field header renames vs A
// (see parity analysis). All are canonical B labels (more precise). Non-regressive.
//
// Gender gate: B's `identity.gender` placeholder row:
//   show_in_public=true, admin_only=false, deprecated_at IS NULL → genderAiVisible=true.
//   Matches A (ai_visible=true for the gender field_definitions row). The gender
//   VALUE is still read from talent_profiles.gender (column-backed; not field_values).
//
// MISSING B KEYS (not bridged; excluded from B-reader output):
//   instagram_url, tiktok_url, youtube_url — System-A-only social URL fields.
//   These have no `profile_field_definitions` row. A B-read that threw on missing
//   keys would degrade to A on every call — defeating the repoint. Instead, we
//   exclude them and document the semantic gap: social URLs are low-signal for
//   embedding retrieval (handles/links, not descriptive text).
//
// B kind → A value_type mapping: subset covering the field types that appear on
// bridged keys (text/number/boolean/date/select). `select` maps to "text"
// because B stores the label directly as a string in the JSONB value (no separate
// taxonomy_ids column), so the stringifier treats it as `value_text`.

/** Map a B `kind` to the A `value_type` understood by `stringifyFieldValue`. */
function bKindToValueType(kind: string | null): string {
  switch (kind) {
    case "number":
      return "number";
    case "toggle":
      return "boolean";
    case "date":
      return "date";
    case "textarea":
      return "textarea";
    case "multiselect":
    case "chips":
      // B stores multi-select labels as a JSONB array; the B-reader below handles
      // this by extracting the array as a comma-joined string for the AI doc.
      return "text";
    case "select":
    case "text":
    default:
      return "text";
  }
}

/** Reverse map: B field_key → A legacy key. Derived from OLD_TO_NEW_KEY. Built
 *  once at module load; only 16 bridged scalar keys (no taxonomy direct-keys —
 *  those have 0 A field_values rows so they contribute nothing via this path). */
const B_TO_A_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(OLD_TO_NEW_KEY).map(([aKey, bKey]) => [bKey, aKey]),
);

async function readAiSearchDocFieldsFromB(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<AiSearchDocFieldsResult> {
  // Step 1 — fetch non-deprecated B defs that are show_in_public=true,
  // admin_only=false, and mapped to an A key via the bridge.
  // We also fetch the identity.gender row separately for the gender gate.
  const bKeysNeeded = Object.keys(B_TO_A_KEY);

  if (bKeysNeeded.length === 0) {
    // Structural guard: if the bridge map is ever empty, throw so the seam
    // falls back to A rather than returning an empty field list silently.
    throw new Error("[ai_search_doc/B] OLD_TO_NEW_KEY bridge is empty — cannot read B");
  }

  const [{ data: bDefs, error: bDefsErr }, { data: genderRow, error: genderErr }] =
    await Promise.all([
      supabase
        .from("profile_field_definitions")
        .select("id, field_key, label, kind")
        .in("field_key", bKeysNeeded)
        .is("deprecated_at", null)
        .eq("show_in_public", true)
        .eq("admin_only", false),
      supabase
        .from("profile_field_definitions")
        .select("field_key, show_in_public, admin_only, deprecated_at")
        .eq("field_key", "identity.gender")
        .maybeSingle(),
    ]);

  if (bDefsErr) {
    throw new Error(`[ai_search_doc/B] profile_field_definitions: ${bDefsErr.message}`);
  }
  if (genderErr) {
    throw new Error(`[ai_search_doc/B] profile_field_definitions gender: ${genderErr.message}`);
  }

  const defRows = (bDefs ?? []) as Array<{
    id: string;
    field_key: string;
    label: string | null;
    kind: string | null;
  }>;

  // Build def-id → A-key + label + kind map for fast value iteration.
  const defById = new Map(
    defRows.map((d) => [
      d.id,
      {
        aKey: B_TO_A_KEY[d.field_key] ?? d.field_key,
        label: d.label ?? (B_TO_A_KEY[d.field_key] ?? d.field_key),
        kind: d.kind,
      },
    ]),
  );

  const defIds = defRows.map((d) => d.id).filter(Boolean);

  // Step 2 — fetch B values for this talent + these defs.
  const { data: bValues, error: bValErr } = await supabase
    .from("talent_profile_field_values")
    .select("field_definition_id, value")
    .eq("talent_profile_id", talentProfileId)
    .in("field_definition_id", defIds);

  if (bValErr) {
    throw new Error(`[ai_search_doc/B] talent_profile_field_values: ${bValErr.message}`);
  }

  // Step 3 — project each B value row to an AiSearchDocumentFieldLine.
  const aiVisibleFields: AiSearchDocumentFieldLine[] = [];
  for (const bv of (bValues ?? []) as Array<{ field_definition_id: string; value: unknown }>) {
    const meta = defById.get(bv.field_definition_id);
    if (!meta) continue;

    // Extract the stringified value from B's JSONB scalar.
    // JSONB primitives (string/number/boolean) → text directly.
    // JSONB arrays (multiselect labels) → join with ", ".
    // NULL / empty object → skip.
    const rawVal = bv.value;
    let stringVal: string | null = null;
    if (rawVal === null || rawVal === undefined) {
      continue;
    } else if (typeof rawVal === "string") {
      stringVal = rawVal.trim() || null;
    } else if (typeof rawVal === "number") {
      stringVal = !Number.isNaN(rawVal) ? String(rawVal) : null;
    } else if (typeof rawVal === "boolean") {
      stringVal = rawVal ? "Yes" : "No";
    } else if (Array.isArray(rawVal)) {
      // multiselect stored as JSONB array of label strings in B
      const parts = rawVal
        .map((item) => (typeof item === "string" ? item.trim() : String(item)))
        .filter(Boolean);
      stringVal = parts.length > 0 ? parts.join(", ") : null;
    }
    if (!stringVal) continue;

    // Use the A key (vocabulary the AI doc uses), B label (more precise).
    aiVisibleFields.push({
      key: meta.aKey,
      label_en: meta.label,
      value: stringVal,
    });
  }

  // Step 4 — gender gate from B's identity.gender row.
  // B's identity.gender is considered ai_visible when show_in_public=true,
  // admin_only=false, deprecated_at IS NULL — matching the A ai_visible=true result.
  const gr = genderRow as {
    show_in_public: boolean;
    admin_only: boolean;
    deprecated_at: string | null;
  } | null;
  const genderAiVisible =
    gr != null && gr.show_in_public === true && gr.admin_only === false && gr.deprecated_at == null;

  return { aiVisibleFields, genderAiVisible };
}

// ── Reader pair ───────────────────────────────────────────────────────────────

/** The reader pair for the AI search-doc field-values load. Exposed for tests
 *  and the `readFieldSurfaceBoth` parity harness. */
export const aiSearchDocReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient, string],
  AiSearchDocFieldsResult
> = {
  readA: readAiSearchDocFieldsFromA,
  readB: readAiSearchDocFieldsFromB,
};

/**
 * PUBLIC entry — load the AI-visible field lines + gender gate from the active
 * source for the `ai_search_doc` surface.
 *
 * Default (`ai_search_doc:b` as of T2.5): reads canonical System B
 * (`talent_profile_field_values` joined to `profile_field_definitions`),
 * projected to the identical `AiSearchDocFieldsResult` shape. A B-read that
 * throws safe-falls-back to A (the surface never hardens into a broken doc).
 *
 * Rollback: set `FIELD_ENGINE_READ_SOURCE=ai_search_doc:a` (or `=a`) in
 * Vercel env and redeploy — no code change needed.
 *
 * Semantic notes (non-regressive, documented for reviewers):
 *   • Social URLs (instagram/tiktok/youtube) are EXCLUDED from the B-read (no
 *     canonical `profile_field_definitions` row for these keys). These fields
 *     have 22/6/5 rows in A's field_values; their absence from B is a bridging
 *     gap, not a B parity failure. The AI doc's primary content (taxonomy terms,
 *     profile columns, languages, service areas) is unaffected.
 *   • Value vocabulary: B returns human labels ("Dark brown") where A returns
 *     slugs ("dark_brown"). Labels are preferred for embedding quality.
 *   • Field header labels: 5 fields use B's canonical label (more precise).
 */
export function readAiSearchDocFields(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<AiSearchDocFieldsResult> {
  return readFieldSurface(
    "ai_search_doc",
    aiSearchDocReaderPair,
    supabase,
    talentProfileId,
  );
}

// Re-export the B-key helper for the unit test
export { bKindToValueType, B_TO_A_KEY };
