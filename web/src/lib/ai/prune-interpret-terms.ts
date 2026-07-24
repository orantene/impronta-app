import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

/**
 * Prune AI-interpreted taxonomy terms to the tenant's LIVE roster.
 *
 * The interpret catalog spans the whole platform taxonomy (~1k terms), so the
 * model happily returns semantically-correct terms that no profile in THIS
 * tenant carries ("Model" when the roster is tagged "Commercial Model",
 * "Blonde hair" when nobody tagged hair). The directory engine ANDs across
 * kinds, so one dead kind zeroes the whole result set — the classic
 * "AI search always returns nothing" failure.
 *
 * Populated-closure model: collect every term an active roster profile is
 * tagged with, then walk each tagged term's ancestor chain upward — a term is
 * "populated" iff it is a tagged term or an ancestor of one (that matches the
 * directory engine, which expands a requested parent down to tagged leaves).
 * Each interpreted term is then:
 * 1. kept when populated;
 * 2. else replaced by its nearest populated ancestor ("Model" → the tagged
 *    subtree's parent group);
 * 3. else dropped — an honest broad result beats a guaranteed empty one.
 *
 * `tenantId` null (platform/hub surfaces) or any query failure returns the
 * input unchanged (fail-open: worst case is today's behavior).
 */
export async function pruneInterpretTermsToTenantRoster(
  supabase: SupabaseClient,
  tenantId: string | null,
  termIds: string[],
): Promise<string[]> {
  if (!tenantId || termIds.length === 0) return termIds;
  try {
    const { data: rosterRows, error: rosterErr } = await supabase
      .from("agency_talent_roster")
      .select("talent_profile_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .limit(2000);
    if (rosterErr) throw rosterErr;
    const profileIds = (rosterRows ?? [])
      .map((r) => (r as { talent_profile_id: string | null }).talent_profile_id)
      .filter((v): v is string => Boolean(v));
    if (profileIds.length === 0) return termIds;

    // Every term tagged on an active roster profile. Chunked: PostgREST
    // filters ride the query string and a large roster would overflow the URL.
    const CHUNK = 150;
    const tagged = new Set<string>();
    for (let i = 0; i < profileIds.length; i += CHUNK) {
      const { data, error } = await supabase
        .from("talent_profile_taxonomy")
        .select("taxonomy_term_id")
        .in("talent_profile_id", profileIds.slice(i, i + CHUNK))
        .limit(10000);
      if (error) throw error;
      for (const r of data ?? []) {
        const id = (r as { taxonomy_term_id: string | null }).taxonomy_term_id;
        if (id) tagged.add(id);
      }
    }
    if (tagged.size === 0) return termIds;

    // Ancestor closure of the tagged set (≤8 levels, taxonomy is shallow).
    const populated = new Set<string>(tagged);
    let frontier = [...tagged];
    for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
      const { data, error } = await supabase
        .from("taxonomy_terms")
        .select("id, parent_id")
        .in("id", frontier);
      if (error) throw error;
      const next: string[] = [];
      for (const r of data ?? []) {
        const pid = (r as { parent_id: string | null }).parent_id;
        if (pid && !populated.has(pid)) {
          populated.add(pid);
          next.push(pid);
        }
      }
      frontier = next;
    }

    const kept = termIds.filter((id) => populated.has(id));
    let unresolved = termIds.filter((id) => !populated.has(id));

    // Nearest populated ancestor for the unresolved remainder (≤4 hops).
    const substitutes = new Set<string>();
    for (let hop = 0; hop < 4 && unresolved.length > 0; hop++) {
      const { data, error } = await supabase
        .from("taxonomy_terms")
        .select("id, parent_id")
        .in("id", unresolved);
      if (error) throw error;
      const climbing: string[] = [];
      for (const r of data ?? []) {
        const pid = (r as { parent_id: string | null }).parent_id;
        if (!pid) continue;
        if (populated.has(pid)) substitutes.add(pid);
        else climbing.push(pid);
      }
      unresolved = climbing;
    }

    return [...new Set([...kept, ...substitutes])];
  } catch (e) {
    logServerError("ai/prune-interpret-terms", e);
    return termIds;
  }
}
