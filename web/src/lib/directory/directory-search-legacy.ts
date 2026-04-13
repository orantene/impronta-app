import type { SupabaseClient } from "@supabase/supabase-js";

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
    { data: searchableDefRows, error: searchableDefErr },
  ] = await Promise.all([
    supabase
      .from("talent_profiles")
      .select("id")
      .is("deleted_at", null)
      .eq("workflow_status", "approved")
      .eq("visibility", "public")
      .or(
        `display_name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,profile_code.ilike.%${term}%,short_bio.ilike.%${term}%,bio_en.ilike.%${term}%,bio_es.ilike.%${term}%`,
      ),
    supabase
      .from("locations")
      .select("id")
      .is("archived_at", null)
      .or(
        `city_slug.ilike.%${term}%,display_name_en.ilike.%${term}%,display_name_es.ilike.%${term}%`,
      ),
    supabase
      .from("taxonomy_terms")
      .select("id")
      .is("archived_at", null)
      .or(`name_en.ilike.%${term}%,name_es.ilike.%${term}%,slug.ilike.%${term}%`),
    supabase
      .from("field_definitions")
      .select("id")
      .eq("searchable", true)
      .eq("active", true)
      .is("archived_at", null)
      .eq("internal_only", false)
      .eq("public_visible", true)
      .eq("profile_visible", true)
      .in("value_type", ["text", "textarea"]),
  ]);

  if (profileError || locationError || termError || searchableDefErr) {
    throw new Error(
      `[directory] legacy search: ${profileError?.message ?? locationError?.message ?? termError?.message ?? searchableDefErr?.message}`,
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
      .eq("workflow_status", "approved")
      .eq("visibility", "public")
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

  const searchableDefIds = ((searchableDefRows ?? []) as { id: string }[])
    .map((r) => r.id)
    .filter(Boolean);
  if (termSafe.length > 0 && searchableDefIds.length > 0) {
    const { data: valueHits, error: valueHitErr } = await supabase
      .from("field_values")
      .select("talent_profile_id")
      .in("field_definition_id", searchableDefIds)
      .ilike("value_text", `%${termSafe}%`);

    if (valueHitErr) {
      throw new Error(`[directory] legacy search field_values: ${valueHitErr.message}`);
    }
    for (const row of (valueHits ?? []) as { talent_profile_id: string }[]) {
      matchedIds.add(row.talent_profile_id);
    }
  }

  return [...matchedIds];
}
