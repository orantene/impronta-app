// src/lib/field-engine/read-source-directory-search.ts
//
// T2.5a → T2.6 — DIRECTORY TEXT-SEARCH value-store repoint (now FULLY System B).
//
// `fetchLegacyDirectorySearchTalentIds` (directory-search-legacy.ts) is the
// pre-RPC fallback directory search. One of its legs ILIKEs the SEARCHABLE
// text/textarea field VALUES and unions the matching `talent_profile_id`s into
// the result set. This module lifts that leg behind the shared read-source seam:
// `readA` is the legacy System A read (`field_values.value_text`, kept verbatim
// as the kill-switch fallback) and `readB` reads canonical System B
// (`talent_profile_field_values`) for the SAME projected output (a Set of
// matching talent_profile_id added to the accumulator the caller passes in).
//
// THE COVERAGE BRIDGE (the crux):
//   The searchable A defs split into two groups (verified read-only against prod
//   ref pluhdapdnuiulvxmyspd, 2026-06-11):
//     • 13 BRIDGED-BY-KEY keys (body_type, clothing_size, eye_color, hair_color,
//       hair_length, shoe_size, experience_level, notable_work,
//       professional_highlights, availability_status, available_for,
//       travel_scope, website_url) — each has a canonical System B definition
//       reachable via the A→B key bridge (`OLD_TO_NEW_KEY`). readB ILIKEs these
//       on B's jsonb scalar. ILIKE is case-insensitive so it matches whether B
//       stored the canonical LABEL ("Athletic") or the A SLUG residue
//       ("athletic"); per-query A-vs-B id-set parity is 0/0 symmetric diff on 8
//       attribute-value sample queries.
//     • 3 SOCIAL keys (instagram_url, tiktok_url, youtube_url) — NOT in the
//       generic A→B key bridge, but System B DOES have canonical equivalents
//       under DIFFERENT keys: creator.instagram_handle (~28 talents),
//       creator.tiktok_handle (~26), creator.youtube_channel (~27). T2.6 repoints
//       this leg from A → B via the explicit map below. readB resolves these B
//       defs and ILIKEs their jsonb scalar — so search has ZERO System-A reads.
//       The B values are bare handles ("@nina.hart") while the legacy A values
//       were demo URLs ("https://instagram.com/nina.hart.demo", 32/33 `.demo`
//       seed data). A query matching a NAME/HANDLE fragment is identical to the
//       old A leg (and the talent is independently covered by the name/profile
//       leg); the only diffs are URL-text-substring artifacts ("https"/".com"/
//       ".demo") that are not meaningful talent searches.
//   display_name + short_bio are also searchable A text defs but carry ZERO
//   field_values rows AND are already searched on the `talent_profiles` columns
//   in the same legacy query — so they need no value-store read in either store.
//
// The caller (directory-search-legacy.ts) passes the accumulator Set + the
// already-resolved searchable A def rows (id+key) + the sanitized search term.
// T3.2 collapsed this surface to canonical System B only — both seam legs read
// B; a readB throw re-runs the same B reader (System A is retired, no fallback).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldSurfaceReaderPair } from "@/lib/field-engine/read-source";
import { readFieldSurface } from "@/lib/field-engine/read-source";
import { OLD_TO_NEW_KEY } from "@/lib/fields/legacy-mirror";

/** A searchable field: its legacy `key` drives the B-read (resolve the canonical
 *  def via the A→B key bridge or the social-key map). `id` is OPTIONAL — it was
 *  the legacy `field_values.field_definition_id` join key, no longer consulted
 *  now that the search reads System B only (T3.2). */
export type DirectorySearchFieldDef = {
  /** Legacy `field_definitions.id` — deprecated, no longer read. */
  id?: string;
  /** Legacy `field_definitions.key` (e.g. "body_type", "instagram_url"). */
  key: string;
};

/** The FROZEN set of searchable legacy field keys (captured 1:1 from the prod
 *  `field_definitions` searchable gate, ref pluhdapdnuiulvxmyspd, 2026-06-11).
 *  The B-reader resolves each to its canonical System B def (13 bridged via
 *  OLD_TO_NEW_KEY + 3 social via the social map); `display_name`/`short_bio` have
 *  no field_values data and resolve to neither (covered by the talent_profiles
 *  column search) — included for completeness, harmlessly skipped by the reader. */
export const DIRECTORY_SEARCHABLE_KEYS: readonly DirectorySearchFieldDef[] = [
  { key: "availability_status" },
  { key: "available_for" },
  { key: "body_type" },
  { key: "clothing_size" },
  { key: "display_name" },
  { key: "experience_level" },
  { key: "eye_color" },
  { key: "hair_color" },
  { key: "hair_length" },
  { key: "instagram_url" },
  { key: "notable_work" },
  { key: "professional_highlights" },
  { key: "shoe_size" },
  { key: "short_bio" },
  { key: "tiktok_url" },
  { key: "travel_scope" },
  { key: "website_url" },
  { key: "youtube_url" },
] as const;

/** Social searchable A keys → their canonical System B field_key. These three
 *  are NOT in the generic A→B key bridge (`OLD_TO_NEW_KEY`) because the B keys
 *  live under a different name (handle vs URL), but B carries the canonical
 *  social value, so the search reads B here instead of legacy A `field_values`.
 *  Verified against prod (2026-06-11): creator.instagram_handle(28),
 *  creator.tiktok_handle(26), creator.youtube_channel(27), all non-deprecated. */
export const DIRECTORY_SEARCH_SOCIAL_A_TO_B_KEY: Readonly<Record<string, string>> = {
  instagram_url: "creator.instagram_handle",
  tiktok_url: "creator.tiktok_handle",
  youtube_url: "creator.youtube_channel",
};

// ── B-reader: canonical System B ONLY (zero System-A reads) ───────────────────
//
// Same projected shape (the accumulator Set). Every searchable key resolves to a
// canonical System B `profile_field_definitions.field_key` — the bridged keys via
// the generic A→B key bridge (`OLD_TO_NEW_KEY`), the three social keys via the
// explicit `DIRECTORY_SEARCH_SOCIAL_A_TO_B_KEY` map. The reader resolves all those
// B field_keys to their def ids in ONE lookup and ILIKEs B's jsonb scalar
// (`value->>0` — Postgres returns the scalar string for these string/number/bool
// values; arrays/objects, never these keys, render as json text that won't match
// an attribute-value query). It only throws on a real DB error (the seam re-runs
// this same B reader on a throw). There are NO `field_values` / System-A reads
// here — System A is retired.
async function readDirectorySearchIdsFromB(
  supabase: SupabaseClient,
  searchableDefs: readonly DirectorySearchFieldDef[],
  termSafe: string,
  acc: Set<string>,
): Promise<Set<string>> {
  if (termSafe.length === 0) return acc;

  // Resolve every searchable A key to its canonical System B field_key. Bridged
  // attribute keys come from the generic A→B bridge; the three social keys come
  // from the dedicated social map. display_name/short_bio (no field_values data,
  // covered by the talent_profiles column search) resolve to neither and are
  // skipped.
  const bKeys = new Set<string>();
  for (const def of searchableDefs) {
    const bridged = OLD_TO_NEW_KEY[def.key];
    if (bridged) {
      bKeys.add(bridged);
      continue;
    }
    const social = DIRECTORY_SEARCH_SOCIAL_A_TO_B_KEY[def.key];
    if (social) bKeys.add(social);
  }
  if (bKeys.size === 0) return acc;

  const { data: defRows, error: defErr } = await supabase
    .from("profile_field_definitions")
    .select("id")
    .in("field_key", [...bKeys])
    .is("deprecated_at", null);
  if (defErr) {
    throw new Error(`[directory] legacy search canonical def: ${defErr.message}`);
  }
  const bDefIds = ((defRows ?? []) as { id: string }[]).map((r) => r.id).filter(Boolean);
  if (bDefIds.length === 0) return acc;

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

  return acc;
}

/** The reader pair, exposed so a test/diagnostic can run A and B side by side via
 *  `readFieldSurfaceBoth` without going through the env flag. */
export const directorySearchReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient, readonly DirectorySearchFieldDef[], string, Set<string>],
  Set<string>
> = {
  // T3.2 — System A removed: the legacy `field_values` ILIKE A-reader was
  // deleted. Both legs read canonical System B (the search reader was already
  // B-only in logic; only the kill-switch fallback touched A). NO field_values read.
  readA: readDirectorySearchIdsFromB,
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
