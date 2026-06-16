import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addDirectorySearchValueMatches,
  DIRECTORY_SEARCHABLE_KEYS,
} from "@/lib/field-engine/read-source-directory-search";

function escapeIlike(input: string): string {
  return input.replaceAll(",", " ").replace(/\s+/g, " ").trim();
}

/** Prevent user-supplied `%` / `_` from widening ILIKE patterns. */
function sanitizeIlikePatternSegment(input: string): string {
  return input.replaceAll("%", "").replaceAll("_", "").trim();
}

function orResidenceOrLegacyLocationMatches(locationIds: string[]): string {
  const list = locationIds.join(",");
  return `residence_city_id.in.(${list}),location_id.in.(${list})`;
}

/**
 * Pre-RPC directory search (multi-query, client-assembled).
 * Kept temporarily as rollout fallback when `directory_search_public_talent_ids` is missing.
 */
export async function fetchLegacyDirectorySearchTalentIds(
  supabase: SupabaseClient,
  queryText: string,
): Promise<string[]> {
  const term = escapeIlike(queryText);
  const termSafe = sanitizeIlikePatternSegment(term);

  const [
    { data: profileMatches, error: profileError },
    { data: locationMatches, error: locationError },
    { data: taxonomyTermMatches, error: termError },
  ] = await Promise.all([
    supabase
      .from("talent_profiles")
      .select("id")
      .is("deleted_at", null)
      .eq("is_publicly_hidden", false)
      .or(
        `display_name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,profile_code.ilike.%${term}%,short_bio.ilike.%${term}%,bio_i18n->>en.ilike.%${term}%,bio_i18n->>es.ilike.%${term}%`,
      ),
    supabase
      .from("locations")
      .select("id")
      .is("archived_at", null)
      .or(
        `city_slug.ilike.%${term}%,display_name_i18n->>en.ilike.%${term}%,display_name_i18n->>es.ilike.%${term}%`,
      ),
    supabase
      .from("taxonomy_terms")
      .select("id")
      .is("archived_at", null)
      .or(`name_i18n->>en.ilike.%${term}%,name_i18n->>es.ilike.%${term}%,slug.ilike.%${term}%`),
  ]);

  if (profileError || locationError || termError) {
    throw new Error(
      `[directory] legacy search: ${profileError?.message ?? locationError?.message ?? termError?.message}`,
    );
  }

  const matchedIds = new Set<string>(
    ((profileMatches ?? []) as { id: string }[]).map((row) => row.id),
  );

  const locationIds = ((locationMatches ?? []) as { id: string }[]).map((row) => row.id);
  if (locationIds.length > 0) {
    const { data: locationTalentRows, error: locationTalentError } = await supabase
      .from("talent_profiles")
      .select("id")
      .is("deleted_at", null)
      .eq("is_publicly_hidden", false)
      .or(orResidenceOrLegacyLocationMatches(locationIds));

    if (locationTalentError) {
      throw new Error(`[directory] legacy search location talent: ${locationTalentError.message}`);
    }

    for (const row of (locationTalentRows ?? []) as { id: string }[]) {
      matchedIds.add(row.id);
    }
  }

  const taxonomyTermMatchIds = ((taxonomyTermMatches ?? []) as { id: string }[]).map((row) => row.id);
  if (taxonomyTermMatchIds.length > 0) {
    const { data: taxonomyTalentRows, error: taxonomyTalentError } = await supabase
      .from("talent_profile_taxonomy")
      .select("talent_profile_id")
      .in("taxonomy_term_id", taxonomyTermMatchIds);

    if (taxonomyTalentError) {
      throw new Error(`[directory] legacy search taxonomy talent: ${taxonomyTalentError.message}`);
    }

    for (const row of (taxonomyTalentRows ?? []) as { talent_profile_id: string }[]) {
      matchedIds.add(row.talent_profile_id);
    }
  }

  if (termSafe.length > 0) {
    // The searchable-field VALUE leg reads canonical System B via the
    // `directory_search` read-source seam (T3.2: System A fully removed). The
    // seam resolves each searchable legacy key to its B `field_key` (the 13
    // bridged keys via OLD_TO_NEW_KEY + the 3 social keys via its social map) and
    // ILIKEs `talent_profile_field_values`. The legacy `id` it once received is no
    // longer consulted, so we pass the FROZEN searchable-key list directly rather
    // than reading the retired `field_definitions` registry. display_name/short_bio
    // carry no field_values data and are already covered by the talent_profiles
    // column search above, so they are intentionally omitted here.
    await addDirectorySearchValueMatches(
      supabase,
      DIRECTORY_SEARCHABLE_KEYS,
      termSafe,
      matchedIds,
    );
  }

  return [...matchedIds];
}
