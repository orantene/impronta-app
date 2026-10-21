import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

/**
 * Which of these hub listings are sellable right now, in ONE database call per chunk
 * (`workspace_service_listing_is_sellable(p_listing_ids uuid[])`, held migration
 * 20261231421200). The rule lives in the database; this only asks.
 *
 * FAIL CLOSED: an RPC error, a missing function (migration not applied), a malformed reply
 * or an id the database did not return all mean "not sellable". Returns `null` when the
 * answer is unknown so the caller can tell "nothing sellable" from "could not ask", but
 * every caller must treat `null` exactly like an empty set (show nothing, sell nothing).
 */

export const LISTING_SELLABLE_CHUNK = 500;
const SINGLE_FALLBACK_BATCH = 8;
const SINGLE_FALLBACK_MAX = 200;

/** PostgREST "no such function with these arguments" (PGRST202) or Postgres undefined_function (42883). */
function isMissingBatchFunction(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

async function askOneByOne(admin: SupabaseClient, ids: readonly string[]): Promise<string[] | null> {
  const capped = ids.slice(0, SINGLE_FALLBACK_MAX);
  const yes: string[] = [];
  for (let i = 0; i < capped.length; i += SINGLE_FALLBACK_BATCH) {
    const results = await Promise.all(
      capped.slice(i, i + SINGLE_FALLBACK_BATCH).map(async (id) => {
        const { data, error } = await admin.rpc("workspace_service_listing_is_sellable", { p_listing_id: id });
        // An error on the single function is unknown, not "no": the whole answer becomes unknown.
        return error ? null : data === true;
      }),
    );
    if (results.some((r) => r === null)) return null;
    capped.slice(i, i + SINGLE_FALLBACK_BATCH).forEach((id, j) => results[j] && yes.push(id));
  }
  return yes;
}

export async function sellableListingIds(admin: SupabaseClient, listingIds: readonly string[]): Promise<Set<string> | null> {
  // Ids come from our own listing rows; the database casts them to uuid (a bad one errors, which is "unknown").
  const ids = [...new Set(listingIds)].filter((id) => typeof id === "string" && id.length > 0 && id.length <= 64);
  const out = new Set<string>();
  if (ids.length === 0) return out;
  try {
    for (let i = 0; i < ids.length; i += LISTING_SELLABLE_CHUNK) {
      const chunk = ids.slice(i, i + LISTING_SELLABLE_CHUNK);
      const { data, error } = await admin.rpc("workspace_service_listing_is_sellable", { p_listing_ids: chunk });
      if (error && isMissingBatchFunction(error)) {
        // The batch migration (421200) is not applied yet: ask the single-id function instead,
        // a few at a time. Same rule, same fail-closed answers; only slower.
        const single = await askOneByOne(admin, chunk);
        if (single === null) return null;
        for (const id of single) out.add(id);
        continue;
      }
      if (error || !Array.isArray(data)) {
        if (error) logServerError("serviceHub.listingSellableBatch", error);
        return null;
      }
      const asked = new Set(chunk);
      // Only ids we asked about, only exact strings: anything else is ignored, never trusted.
      for (const v of data) if (typeof v === "string" && asked.has(v)) out.add(v);
    }
    return out;
  } catch (err) {
    logServerError("serviceHub.listingSellableBatch", err);
    return null;
  }
}
