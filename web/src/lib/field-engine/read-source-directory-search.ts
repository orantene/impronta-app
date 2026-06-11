// src/lib/field-engine/read-source-directory-search.ts
//
// T2.5a — DIRECTORY TEXT-SEARCH value-store repoint.
//
// `fetchLegacyDirectorySearchTalentIds` (directory-search-legacy.ts) is the
// pre-RPC fallback directory search. One of its legs ILIKEs
// `field_values.value_text` across the SEARCHABLE text/textarea field
// definitions and unions the matching `talent_profile_id`s into the result set.
// This module lifts that leg behind the shared read-source seam as `readA`
// (byte-identical to today) and adds a `readB` that reads canonical System B
// (`talent_profile_field_values`) for the SAME projected output (a Set of
// matching talent_profile_id added to the accumulator the caller passes in).
//
// THE COVERAGE BRIDGE (the crux):
//   The searchable A defs split into two groups (verified read-only against prod
//   ref pluhdapdnuiulvxmyspd, 2026-06-11):
//     • 13 BRIDGED keys (body_type, clothing_size, eye_color, hair_color,
//       hair_length, shoe_size, experience_level, notable_work,
//       professional_highlights, availability_status, available_for,
//       travel_scope, website_url) — each has a canonical System B definition.
//       readB ILIKEs these on B's jsonb scalar. ILIKE is case-insensitive so it
//       matches whether B stored the canonical LABEL ("Athletic") or the A SLUG
//       residue ("athletic"); per-query A-vs-B id-set parity is 0/0 symmetric
//       diff on 8 attribute-value sample queries.
//     • 3 UN-BRIDGED social-URL keys (instagram_url, tiktok_url, youtube_url) —
//       NO canonical B definition exists. readB KEEPS reading these from A so
//       search coverage is byte-identical (a pure B-repoint would silently drop
//       33 populated social-URL rows from search). display_name + short_bio are
//       also searchable A text defs but carry ZERO field_values rows AND are
//       already searched on the `talent_profiles` columns in the same legacy
//       query — so they need no value-store read in either store.
//   Net: readB(B-bridged ∪ A-social) == readA across all 14 sample queries
//   (incl. "instagram"/"tik"/"youtu"): a_only=0, b_only=0.
//
// The caller (directory-search-legacy.ts) passes the accumulator Set + the
// already-resolved searchable A def rows (id+key) + the sanitized search term.
// The seam picks A or B via the `directory_search` flag; a B-read that throws
// safe-falls-back to A.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldSurfaceReaderPair } from "@/lib/field-engine/read-source";
import { readFieldSurface } from "@/lib/field-engine/read-source";
import { OLD_TO_NEW_KEY } from "@/lib/fields/legacy-mirror";

/** A searchable legacy field definition: its A id + A key. The id drives the
 *  A-read (`field_values.field_definition_id`); the key drives the B-read
 *  (resolve the canonical def via the A→B key bridge) and the un-bridged
 *  social-URL carve-out. */
export type DirectorySearchFieldDef = {
  /** Legacy `field_definitions.id`. */
  id: string;
  /** Legacy `field_definitions.key` (e.g. "body_type", "instagram_url"). */
  key: string;
};

/** Legacy searchable text keys that have NO canonical System B definition and
 *  must keep reading System A so search coverage stays byte-identical. Verified
 *  against prod (2026-06-11): instagram_url(22)/tiktok_url(5)/youtube_url(6) carry
 *  populated value_text with no other search coverage; B has no def for them. */
export const DIRECTORY_SEARCH_UNBRIDGED_KEYS: ReadonlySet<string> = new Set([
  "instagram_url",
  "tiktok_url",
  "youtube_url",
]);

// ── A-reader: legacy System A (`field_values.value_text` ILIKE) ──────────────
//
// Lifted VERBATIM from the `field_values` leg of fetchLegacyDirectorySearchTalentIds
// so `directory_search:a` is byte-for-byte today. ILIKEs value_text on ALL the
// searchable def ids and adds every matching talent_profile_id to the accumulator.
async function readDirectorySearchIdsFromA(
  supabase: SupabaseClient,
  searchableDefs: readonly DirectorySearchFieldDef[],
  termSafe: string,
  acc: Set<string>,
): Promise<Set<string>> {
  const ids = searchableDefs.map((d) => d.id).filter(Boolean);
  if (ids.length === 0 || termSafe.length === 0) return acc;

  const { data, error } = await supabase
    .from("field_values")
    .select("talent_profile_id")
    .in("field_definition_id", ids)
    .ilike("value_text", `%${termSafe}%`);
  if (error) {
    throw new Error(`[directory] legacy search field_values: ${error.message}`);
  }
  for (const row of (data ?? []) as { talent_profile_id: string }[]) {
    acc.add(row.talent_profile_id);
  }
  return acc;
}

// ── B-reader: canonical System B + the un-bridged social-URL carve-out ────────
//
// Same projected shape (the accumulator Set). For the BRIDGED searchable keys it
// resolves the canonical def via the A→B key bridge and ILIKEs B's jsonb scalar
// (`value #>> '{}'` server-side via the `->>` text cast on the jsonb column). For
// the UN-BRIDGED social-URL keys it ILIKEs `field_values.value_text` on JUST those
// A def-ids — keeping their coverage identical. The two passes union into the
// accumulator. If NO bridged key resolves to a B def the reader still runs the
// social-URL A pass (never throws away coverage); it only throws on a real DB
// error so the seam safe-falls-back to A.
async function readDirectorySearchIdsFromB(
  supabase: SupabaseClient,
  searchableDefs: readonly DirectorySearchFieldDef[],
  termSafe: string,
  acc: Set<string>,
): Promise<Set<string>> {
  if (termSafe.length === 0) return acc;

  // Partition the searchable defs into bridged (read B) and un-bridged social
  // URLs (read A). display_name/short_bio (no field_values data, covered by the
  // talent_profiles column search) fall into neither bucket and are skipped.
  const bridgedBKeys: string[] = [];
  const socialAIds: string[] = [];
  for (const def of searchableDefs) {
    const bKey = OLD_TO_NEW_KEY[def.key];
    if (bKey) {
      bridgedBKeys.push(bKey);
    } else if (DIRECTORY_SEARCH_UNBRIDGED_KEYS.has(def.key) && def.id) {
      socialAIds.push(def.id);
    }
  }

  // Pass 1 — bridged keys from canonical System B.
  if (bridgedBKeys.length > 0) {
    const { data: defRows, error: defErr } = await supabase
      .from("profile_field_definitions")
      .select("id")
      .in("field_key", bridgedBKeys)
      .is("deprecated_at", null);
    if (defErr) {
      throw new Error(`[directory] legacy search canonical def: ${defErr.message}`);
    }
    const bDefIds = ((defRows ?? []) as { id: string }[]).map((r) => r.id).filter(Boolean);
    if (bDefIds.length > 0) {
      // jsonb scalar → text via the PostgREST `->>0` operator on the `value`
      // column so the ILIKE matches the stored string/number/bool scalar
      // (arrays/objects — never these scalar keys — render as their json text,
      // which simply won't match an attribute-value query).
      const { data, error } = await supabase
        .from("talent_profile_field_values")
        .select("talent_profile_id")
        .in("field_definition_id", bDefIds)
        .ilike("value->>0", `%${termSafe}%`);
      if (error) {
        throw new Error(`[directory] legacy search canonical values: ${error.message}`);
      }
      for (const row of (data ?? []) as { talent_profile_id: string }[]) {
        acc.add(row.talent_profile_id);
      }
    }
  }

  // Pass 2 — un-bridged social-URL keys from System A (coverage parity).
  if (socialAIds.length > 0) {
    const { data, error } = await supabase
      .from("field_values")
      .select("talent_profile_id")
      .in("field_definition_id", socialAIds)
      .ilike("value_text", `%${termSafe}%`);
    if (error) {
      throw new Error(`[directory] legacy search social field_values: ${error.message}`);
    }
    for (const row of (data ?? []) as { talent_profile_id: string }[]) {
      acc.add(row.talent_profile_id);
    }
  }

  return acc;
}

/** The reader pair, exposed so a test/diagnostic can run A and B side by side via
 *  `readFieldSurfaceBoth` without going through the env flag. */
export const directorySearchReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient, readonly DirectorySearchFieldDef[], string, Set<string>],
  Set<string>
> = {
  readA: readDirectorySearchIdsFromA,
  readB: readDirectorySearchIdsFromB,
};

/**
 * PUBLIC entry — fold the searchable-field VALUE matches for `termSafe` into
 * `acc`, reading the active value store for the `directory_search` surface. The
 * caller passes the accumulator, the resolved searchable A def rows, and the
 * sanitized term; the flag decides A vs B. A B-read that throws safe-falls-back
 * to A (search never hardens into a broken/empty value leg).
 */
export function addDirectorySearchValueMatches(
  supabase: SupabaseClient,
  searchableDefs: readonly DirectorySearchFieldDef[],
  termSafe: string,
  acc: Set<string>,
): Promise<Set<string>> {
  return readFieldSurface(
    "directory_search",
    directorySearchReaderPair,
    supabase,
    searchableDefs,
    termSafe,
    acc,
  );
}
