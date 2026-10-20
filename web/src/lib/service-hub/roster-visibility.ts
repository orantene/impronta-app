import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import { pickVisibleWithinCap } from "./hub-rules";

/**
 * TUL-1378: over its plan cap, which roster talents stay publicly visible. The OWNER picks
 * (`agency_visibility = 'featured'` is the pick), then the longest-standing members. The rest are
 * hidden from the public directory, never removed (`pickVisibleWithinCap`).
 *
 * Returns the visible ids, or null when no restriction applies (unlimited, within the cap, or the
 * read failed, in which case the directory keeps its existing position-based cap).
 */
export async function visibleRosterIdsWithinCap(
  supabase: Pick<SupabaseClient, "from">,
  tenantId: string,
  rosterIds: readonly string[],
  cap: number | null,
): Promise<string[] | null> {
  if (cap == null || rosterIds.length <= cap) return null;
  const { data, error } = await supabase
    .from("agency_talent_roster")
    .select("talent_profile_id, agency_visibility, added_at")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .in("talent_profile_id", [...rosterIds]);
  if (error) {
    logServerError("serviceHub.rosterVisibility", error);
    return null;
  }
  const rows = (data ?? []) as Array<{ talent_profile_id: string; agency_visibility: string | null; added_at: string | null }>;
  const picked = pickVisibleWithinCap(
    rows.map((r) => ({ id: r.talent_profile_id, pinned: r.agency_visibility === "featured", joinedAt: r.added_at ?? "" })),
    cap,
  );
  return picked.visibleIds;
}
