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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function sellableListingIds(admin: SupabaseClient, listingIds: readonly string[]): Promise<Set<string> | null> {
  const ids = [...new Set(listingIds)].filter((id) => UUID.test(id));
  const out = new Set<string>();
  if (ids.length === 0) return out;
  try {
    for (let i = 0; i < ids.length; i += LISTING_SELLABLE_CHUNK) {
      const chunk = ids.slice(i, i + LISTING_SELLABLE_CHUNK);
      const { data, error } = await admin.rpc("workspace_service_listing_is_sellable", { p_listing_ids: chunk });
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
