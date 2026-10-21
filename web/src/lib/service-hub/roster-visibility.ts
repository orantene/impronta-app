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
  env: Record<string, string | undefined> = process.env,
): Promise<string[] | null> {
  // OFF by default: this changes the live public directory for every over-cap workspace,
  // so until HUB_PLAN_CAP_PICKS_ENABLED=1 the directory keeps today's position-based cap.
  if (env.HUB_PLAN_CAP_PICKS_ENABLED !== "1") return null;
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
  const byId = new Map(rows.map((r) => [r.talent_profile_id, r]));
  // Start from the roster ids we were given: an id the query did not return is still on the
  // roster. It competes as an unpinned person with an unknown join date (last in line), so it
  // can fill a free seat and is never silently dropped.
  const picked = pickVisibleWithinCap(
    [...new Set(rosterIds)].map((id) => {
      const r = byId.get(id);
      return { id, pinned: r?.agency_visibility === "featured", joinedAt: r?.added_at ?? null };
    }),
    cap,
  );
  return picked.visibleIds;
}
